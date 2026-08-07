import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from app.config import settings
from app.db_models import ERPatient, ERVitalsLog, ERUser


def generate_er_discharge_pdf(patient: ERPatient, vitals: list[ERVitalsLog], doctor_name: str = "Unassigned") -> str:
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    file_path = os.path.join(settings.REPORTS_DIR, f"er_summary_{patient.id}.pdf")

    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom emergency branding styles
    title_style = ParagraphStyle(
        'HeaderTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#DC2626'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'HeaderSub',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4B5563'),
        spaceAfter=12
    )

    heading2 = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=10,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    story = []

    # Header
    story.append(Paragraph("PulseQ Emergency Department", title_style))
    story.append(Paragraph(f"Patient Emergency Summary & Clinical Record • Hospital ID: {patient.hospital_id}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#DC2626'), spaceAfter=15))

    # Patient Demographic Info Table
    acuity_labels = {1: "ESI 1 (Resuscitation)", 2: "ESI 2 (Emergent)", 3: "ESI 3 (Urgent)", 4: "ESI 4 (Less Urgent)", 5: "ESI 5 (Non-Urgent)"}
    acuity_str = acuity_labels.get(patient.acuity_level, f"ESI {patient.acuity_level}")

    demo_data = [
        [
            Paragraph(f"<b>Patient Name:</b> {patient.first_name} {patient.last_name}", body_style),
            Paragraph(f"<b>MRN:</b> {patient.mrn}", body_style)
        ],
        [
            Paragraph(f"<b>Age / Gender:</b> {patient.age} y/o / {patient.gender.capitalize()}", body_style),
            Paragraph(f"<b>Arrival Mode:</b> {patient.arrival_mode.replace('_', ' ').title()}", body_style)
        ],
        [
            Paragraph(f"<b>Acuity Level:</b> <font color='#DC2626'><b>{acuity_str}</b></font>", body_style),
            Paragraph(f"<b>ER Status:</b> {patient.status.replace('_', ' ').title()}", body_style)
        ],
        [
            Paragraph(f"<b>Assigned Doctor:</b> {doctor_name}", body_style),
            Paragraph(f"<b>Registered At:</b> {patient.registered_at.strftime('%Y-%m-%d %H:%M') if patient.registered_at else 'N/A'}", body_style)
        ]
    ]

    demo_table = Table(demo_data, colWidths=[270, 270])
    demo_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))

    story.append(demo_table)
    story.append(Spacer(1, 15))

    # Chief Complaint
    story.append(Paragraph("Chief Complaint & Initial Triage Assessment", heading2))
    story.append(Paragraph(patient.chief_complaint or "No complaint documented.", body_style))
    story.append(Spacer(1, 15))

    # Vitals Log History Table
    story.append(Paragraph("Vitals History Log", heading2))

    vitals_data = [
        [
            Paragraph("<b>Timestamp</b>", body_style),
            Paragraph("<b>HR (bpm)</b>", body_style),
            Paragraph("<b>BP (mmHg)</b>", body_style),
            Paragraph("<b>SpO2 (%)</b>", body_style),
            Paragraph("<b>Temp (°C)</b>", body_style),
            Paragraph("<b>RR</b>", body_style),
            Paragraph("<b>Pain</b>", body_style)
        ]
    ]

    if vitals:
        for v in vitals:
            bp_str = f"{v.bp_systolic}/{v.bp_diastolic}" if (v.bp_systolic and v.bp_diastolic) else "-"
            vitals_data.append([
                Paragraph(v.logged_at.strftime('%H:%M:%S') if v.logged_at else "-", body_style),
                Paragraph(str(v.heart_rate or "-"), body_style),
                Paragraph(bp_str, body_style),
                Paragraph(str(v.spo2 or "-"), body_style),
                Paragraph(str(v.temp_c or "-"), body_style),
                Paragraph(str(v.resp_rate or "-"), body_style),
                Paragraph(f"{v.pain_score}/10" if v.pain_score is not None else "-", body_style)
            ])
    else:
        vitals_data.append([Paragraph("No vitals recorded", body_style)] + [Paragraph("-", body_style)]*6)

    vitals_table = Table(vitals_data, colWidths=[90, 75, 85, 75, 75, 70, 70])
    vitals_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ]))

    story.append(vitals_table)
    story.append(Spacer(1, 25))

    # Signature Footer
    footer_text = f"Report Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC • Emergency Department Sign-off"
    story.append(Paragraph(footer_text, ParagraphStyle('Footer', parent=styles['Italic'], fontSize=8, textColor=colors.HexColor('#94A3B8'))))

    doc.build(story)
    return file_path
