import io
from typing import List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="1F2937")
DATA_FONT = Font(name="Calibri", size=11)
BORDER_THIN = Border(
    left=Side(style='thin', color='E5E7EB'),
    right=Side(style='thin', color='E5E7EB'),
    top=Side(style='thin', color='E5E7EB'),
    bottom=Side(style='thin', color='E5E7EB')
)

def auto_fit_columns(ws):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val = str(cell.value or '')
            if len(val) > max_len:
                max_len = len(val)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

def generate_session_assessment_sheet(
    session_id: str,
    session_name: str,
    records: List[Dict[str, Any]]
) -> bytes:
    """
    Generates the Session Assessment Sheet (.xlsx).
    Columns:
    - Session ID
    - Session Name
    - Student USN
    - Student Name
    - Final Mark (out of 5)
    - Reference Score (out of 15)
    - Selected Reference ID
    - Selected Material Name
    - Submission Status
    - Assessment Status
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Session Assessment"

    # Title block
    ws.merge_cells("A1:J1")
    ws["A1"] = f"Assessment Report: {session_name}"
    ws["A1"].font = TITLE_FONT
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 30

    headers = [
        "Session ID",
        "Session Name",
        "Student USN",
        "Student Name",
        "Final Mark (/5)",
        "Ref Score (/15)",
        "Selected Reference ID",
        "Selected Material Name",
        "Submission Status",
        "Assessment Status"
    ]

    ws.append([]) # Blank row 2
    ws.append(headers) # Row 3

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=3, column=col_num)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER_THIN
    ws.row_dimensions[3].height = 24

    for row_idx, r in enumerate(records, start=4):
        row_data = [
            session_id,
            session_name,
            r.get("usn", "N/A"),
            r.get("student_name", "N/A"),
            r.get("final_mark", 0.0),
            r.get("reference_score", 0),
            r.get("selected_reference_id", "N/A"),
            r.get("selected_material_name", "N/A"),
            r.get("submission_status", "N/A"),
            r.get("assessment_status", "N/A")
        ]
        ws.append(row_data)
        for col_num in range(1, len(headers) + 1):
            c = ws.cell(row=row_idx, column=col_num)
            c.font = DATA_FONT
            c.border = BORDER_THIN
            if col_num in [5, 6]:
                c.alignment = Alignment(horizontal="right")
            else:
                c.alignment = Alignment(horizontal="left")

    auto_fit_columns(ws)

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()

def generate_master_performance_sheet(
    sessions: List[Dict[str, str]], # [{"id": "...", "name": "..."}]
    students: List[Dict[str, Any]]  # [{"usn": "...", "name": "...", "scores": {session_id: {"mark": 4.5, "status": "COMPLETED"}}}]
) -> bytes:
    """
    Generates the Master Student Performance Sheet (.xlsx).
    Columns: Student Name, Student USN, [One column per session]
    Clearly distinguishes an assessed zero ("0.0 (Assessed)") from an absent zero ("ABSENT / MISSING").
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Master Performance"

    # Title
    ws.merge_cells("A1:E1")
    ws["A1"] = "Master Student Reflection Performance Report"
    ws["A1"].font = TITLE_FONT
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 30

    headers = ["Student Name", "Student USN"]
    for s in sessions:
        headers.append(f"{s['name']} (/5)")

    ws.append([]) # Row 2 blank
    ws.append(headers) # Row 3

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=3, column=col_num)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER_THIN
    ws.row_dimensions[3].height = 24

    for row_idx, st in enumerate(students, start=4):
        row_data = [st.get("name", ""), st.get("usn", "")]
        student_scores = st.get("scores", {})

        for s in sessions:
            s_id = s["id"]
            rec = student_scores.get(s_id)
            if not rec:
                row_data.append("ABSENT")
            else:
                status = rec.get("status", "")
                if status in ["ABSENT", "MISSING"]:
                    row_data.append("ABSENT (0.00)")
                elif status == "COMPLETED":
                    mark = rec.get("mark", 0.0)
                    row_data.append(float(mark))
                elif status == "NEEDS_REVIEW":
                    row_data.append(f"{rec.get('mark', 0.0)} (Under Review)")
                else:
                    row_data.append(status)

        ws.append(row_data)
        for col_num in range(1, len(headers) + 1):
            c = ws.cell(row=row_idx, column=col_num)
            c.font = DATA_FONT
            c.border = BORDER_THIN
            if col_num > 2 and isinstance(c.value, (int, float)):
                c.alignment = Alignment(horizontal="right")
            else:
                c.alignment = Alignment(horizontal="left")

    auto_fit_columns(ws)

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
