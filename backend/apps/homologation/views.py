import hashlib
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Sum
from django.http import FileResponse, Http404
from django.utils import timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import can_manage_course, user_has_role
from apps.audit.models import AuditLog
from apps.courses.models import Enrollment
from apps.submissions.models import Submission
from .models import Homologation, HomologationGroupScore
from .serializers import HomologationSerializer


class HomologationSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        enrollments = Enrollment.objects.filter(
            student=request.user, status='ACTIVE', course__is_active=True
        ).select_related('course').prefetch_related('course__activity_groups')

        results = []
        for enrollment in enrollments:
            submissions = Submission.objects.filter(enrollment=enrollment)
            approved = submissions.filter(status='APPROVED')
            total_points = approved.aggregate(
                total=Sum('approved_points')
            )['total'] or Decimal('0.00')

            groups = []
            for group in enrollment.course.activity_groups.filter(is_active=True):
                group_approved = approved.filter(
                    activity_item__group=group
                )
                group_points = group_approved.aggregate(
                    total=Sum('approved_points')
                )['total'] or Decimal('0.00')
                groups.append({
                    'group_id': group.id,
                    'group_number': group.group_number,
                    'title': group.title,
                    'approved_points': group_points,
                    'required_min_points': group.min_points,
                    'minimum_reached': group_points >= group.min_points,
                    'activity_limits': list(
                        group.activity_items.filter(is_active=True).values(
                            'id', 'code', 'description',
                            'points_per_unit', 'unit_name',
                            'max_points_semester',
                        )
                    ),
                })

            results.append({
                'enrollment_id': enrollment.id,
                'course': enrollment.course.name,
                'total_approved_points': total_points,
                'required_min_total_points': enrollment.course.min_total_points,
                'minimum_reached': total_points >= enrollment.course.min_total_points,
                'progress_percentage': (
                    min(
                        total_points / enrollment.course.min_total_points * 100,
                        Decimal('100.00'),
                    ) if enrollment.course.min_total_points > 0
                    else Decimal('100.00')
                ),
                'approved_submissions': submissions.filter(status='APPROVED').count(),
                'pending_submissions': submissions.filter(status='PENDING').count(),
                'rejected_submissions': submissions.filter(status='REJECTED').count(),
                'groups': groups,
                'homologation': HomologationSerializer(
                    enrollment.homologations.order_by('-homologated_at').first(),
                    context={'request': request},
                ).data if enrollment.homologations.exists() else None,
            })
        return Response(results)


class FinalizeHomologationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, enrollment_id):
        try:
            # Bloqueia a matrícula para impedir duas homologações simultâneas.
            enrollment = Enrollment.objects.select_for_update().select_related(
                'student', 'course', 'course__campus'
            ).get(pk=enrollment_id)
        except Enrollment.DoesNotExist:
            return Response(
                {'detail': 'Matrícula não encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not can_manage_course(request.user, enrollment.course):
            return Response(
                {'detail': 'Você não tem permissão para homologar este curso.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if Homologation.objects.filter(enrollment=enrollment).exists():
            return Response(
                {'detail': 'Esta matrícula já possui uma homologação registrada.'},
                status=status.HTTP_409_CONFLICT,
            )

        submissions = Submission.objects.filter(
            enrollment=enrollment, status='APPROVED'
        )
        total = submissions.aggregate(
            total=Sum('approved_points')
        )['total'] or Decimal('0.00')
        if total < enrollment.course.min_total_points:
            return Response({
                'detail': 'A pontuação mínima total ainda não foi atingida.',
                'total_approved_points': total,
                'required_min_total_points': enrollment.course.min_total_points,
            }, status=status.HTTP_400_BAD_REQUEST)

        group_rows = []
        for group in enrollment.course.activity_groups.filter(is_active=True):
            points = submissions.filter(
                activity_item__group=group
            ).aggregate(total=Sum('approved_points'))['total'] or Decimal('0.00')
            if points < group.min_points:
                return Response({
                    'detail': 'A pontuação mínima de todos os grupos deve ser atingida.',
                    'group': group.title,
                    'approved_points': points,
                    'required_min_points': group.min_points,
                }, status=status.HTTP_400_BAD_REQUEST)
            group_rows.append((group, points))

        role = request.user.roles.filter(
            role__in=('SIAC_COORDINATOR', 'PROFESSOR')
        ).order_by('role').first()
        if not role:
            return Response(
                {'detail': 'O usuário não possui perfil autorizado para homologar.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        pdf_bytes = self._build_pdf(enrollment, total, group_rows)
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        file_path = default_storage.save(
            f'homologations/{enrollment.id}-{timezone.now():%Y%m%d%H%M%S}.pdf',
            ContentFile(pdf_bytes),
        )

        try:
            with transaction.atomic():
                homologation = Homologation.objects.create(
                    enrollment=enrollment,
                    total_approved_points=total,
                    required_min_total_points=enrollment.course.min_total_points,
                    report_pdf_path=file_path,
                    report_pdf_hash_sha256=pdf_hash,
                    homologated_by=role,
                    homologated_by_role=role.role,
                    homologated_at=timezone.now(),
                    portal_sync_status='NOT_CONFIGURED',
                )
                HomologationGroupScore.objects.bulk_create([
                    HomologationGroupScore(
                        homologation=homologation,
                        group=group,
                        approved_points=points,
                        required_min_points=group.min_points,
                    )
                    for group, points in group_rows
                ])
                AuditLog.objects.create(
                    entity_type='Homologation',
                    entity_id=homologation.pk,
                    action='FINALIZE',
                    actor_id=request.user.pk,
                    ip_address=request.META.get('REMOTE_ADDR'),
                    new_status='HOMOLOGATED',
                    after_snapshot={
                        'total_approved_points': str(total),
                        'report_pdf_hash_sha256': pdf_hash,
                    },
                )
        except Exception:
            default_storage.delete(file_path)
            raise

        return Response(
            HomologationSerializer(
                homologation, context={'request': request}
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _build_pdf(enrollment, total, group_rows):
        buffer = BytesIO()
        document = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        story = [
            Paragraph('Relatório de Homologação - SIAC UTFPR', styles['Title']),
            Spacer(1, 16),
            Paragraph(f'Estudante: {escape(enrollment.student.full_name)}', styles['Normal']),
            Paragraph(f'Identificação: {escape(enrollment.student.institutional_id)}', styles['Normal']),
            Paragraph(f'Curso: {escape(enrollment.course.name)}', styles['Normal']),
            Paragraph(f'Campus: {escape(enrollment.course.campus.name)}', styles['Normal']),
            Paragraph(f'Pontuação total: {total}', styles['Normal']),
            Paragraph(
                f'Mínimo exigido: {enrollment.course.min_total_points}',
                styles['Normal'],
            ),
            Spacer(1, 16),
        ]
        rows = [['Grupo', 'Pontos aprovados', 'Mínimo exigido']]
        rows.extend([
            [escape(group.title), str(points), str(group.min_points)]
            for group, points in group_rows
        ])
        table = Table(rows, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 7),
        ]))
        story.append(table)
        document.build(story)
        return buffer.getvalue()


class HomologationReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        try:
            homologation = Homologation.objects.select_related(
                'enrollment__student', 'enrollment__course'
            ).get(public_id=public_id)
        except Homologation.DoesNotExist:
            raise Http404

        enrollment = homologation.enrollment
        if (
            enrollment.student_id != request.user.id
            and not can_manage_course(request.user, enrollment.course)
        ):
            return Response(
                {'detail': 'Você não tem permissão para acessar este relatório.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not default_storage.exists(homologation.report_pdf_path):
            raise Http404
        response = FileResponse(
            default_storage.open(homologation.report_pdf_path, 'rb'),
            content_type='application/pdf',
        )
        response['Content-Disposition'] = (
            f'attachment; filename="homologacao-{homologation.public_id}.pdf"'
        )
        return response
