import sys, os
import pptx
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
import win32com.client

ppt_path = os.path.abspath(r'd:\Projects\LaunchGraph\resources\presentation\12-10-2026 Review PPT.pptx')
prs = pptx.Presentation(ppt_path)
slide11 = prs.slides[10]

# Remove any shapes other than TextBox 2
shapes_to_remove = [s for s in slide11.shapes if s.name != 'TextBox 2']
for s in shapes_to_remove:
    sp = s._element
    sp.getparent().remove(sp)

# 1. Add Summary Banner Box
left_pos = Emu(838200)
top_pos = Emu(1000000)
width_pos = Emu(10515600)
height_summary = Emu(300000)

tx_box = slide11.shapes.add_textbox(left_pos, top_pos, width_pos, height_summary)
tf = tx_box.text_frame
tf.word_wrap = False
tf.margin_left = Emu(0)
tf.margin_top = Emu(0)
tf.margin_right = Emu(0)
tf.margin_bottom = Emu(0)

p_sum = tf.paragraphs[0]
p_sum.alignment = PP_ALIGN.CENTER
run1 = p_sum.add_run()
run1.text = "Testing Methodology: "
run1.font.name = "Times New Roman"
run1.font.size = Pt(11)
run1.font.bold = True

run2 = p_sum.add_run()
run2.text = "Automated pytest-asyncio Test Suite (Python 3.13)    |    "
run2.font.name = "Times New Roman"
run2.font.size = Pt(11)
run2.font.bold = False

run3 = p_sum.add_run()
run3.text = "Execution Verification: "
run3.font.name = "Times New Roman"
run3.font.size = Pt(11)
run3.font.bold = True

run4 = p_sum.add_run()
run4.text = "34 / 34 Tests Passed (100% Pass Rate in 6.02s across 12 Modules)"
run4.font.name = "Times New Roman"
run4.font.size = Pt(11)
run4.font.bold = True
run4.font.color.rgb = RGBColor(0, 51, 102)

# 2. Add Table
table_top = Emu(1350000)
table_height = Emu(4950000)
num_rows = 7
num_cols = 4

table_shape = slide11.shapes.add_table(num_rows, num_cols, left_pos, table_top, width_pos, table_height)
table = table_shape.table

# Apply table style from slide 8: {3C2FFA5D-87B4-456A-9821-1D502468CF0F}
tblPr = table_shape._element.graphic.graphicData.tbl.tblPr
tblPr.set('firstRow', '1')
style_id_elem = tblPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}tableStyleId')
if style_id_elem is None:
    from pptx.oxml import OxmlElement
    style_id_elem = OxmlElement('a:tableStyleId')
    style_id_elem.text = '{3C2FFA5D-87B4-456A-9821-1D502468CF0F}'
    tblPr.append(style_id_elem)
else:
    style_id_elem.text = '{3C2FFA5D-87B4-456A-9821-1D502468CF0F}'

# Column widths (Total = 10,515,600)
table.columns[0].width = Emu(2300000)
table.columns[1].width = Emu(3250000)
table.columns[2].width = Emu(3915600)
table.columns[3].width = Emu(1050000)

headers = [
    "Test Domain & Module",
    "Experimental Scenario & Methodology",
    "Observed Experimental Results & Invariants",
    "Status"
]

for col_idx, header_text in enumerate(headers):
    cell = table.cell(0, col_idx)
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    cell.margin_left = Emu(49788)
    cell.margin_right = Emu(49788)
    cell.margin_top = Emu(24894)
    cell.margin_bottom = Emu(24894)
    p = cell.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    p.text = header_text
    if p.runs:
        p.runs[0].font.name = "Times New Roman"
        p.runs[0].font.size = Pt(11.5)
        p.runs[0].font.bold = True

rows_config = [
    {
        "col0": [
            ("1. Replay Storm Verification", True),
            ("\n(test_replay_storm.py)", False)
        ],
        "col1": [
            ("Injected 1,000 duplicate & out-of-order webhook events (10 unique events replicated 100x each in randomized order) to stress-test concurrent deduplication.", False)
        ],
        "col2": [
            ("Exactly 10 source_events persisted; 990 rejected as duplicates. Invariant verified: ", False),
            ("0 duplicate records in database (100% idempotency under storm load).", True)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    },
    {
        "col0": [
            ("2. Webhook Ingress & Crypto", True),
            ("\n(test_ingester_webhooks.py,\ntest_crypto.py)", False)
        ],
        "col1": [
            ("Validated constant-time HMAC-SHA256 signatures (GitHub, Slack), timestamp replay prevention window (300s drift check), and timing-safe API key hashing.", False)
        ],
        "col2": [
            ("Valid signatures accepted (200 OK); forged signatures rejected (401 Unauthorized); expired Slack timestamps rejected; API keys securely hashed.", False)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    },
    {
        "col0": [
            ("3. Secret Scrubbing Engine", True),
            ("\n(test_scrubber.py)", False)
        ],
        "col1": [
            ("Evaluated recursive SecretScrubber across deeply nested JSON payloads containing AWS access keys, GitHub PATs, JWT tokens, and RSA private keys.", False)
        ],
        "col2": [
            ("100% deterministic redaction rate ", True),
            ("to [REDACTED_SECRET]. Zero credentials leaked into persistent storage or database logs.", False)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    },
    {
        "col0": [
            ("4. Extraction & Link Typing", True),
            ("\n(test_extractor.py,\ntest_link_typing.py)", False)
        ],
        "col1": [
            ("Compiled regex extraction of Jira keys, PR numbers, commit SHAs from git messages, and deterministic classification across link types L1–L8.", False)
        ],
        "col2": [
            ("100% extraction precision ", True),
            ("(PROJ-1024, #142, 40-char SHA); correctly classified L1 (implements), L3 (fixes), L4 (reverts), L5–L8 with zero ambiguities.", False)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    },
    {
        "col0": [
            ("5. Graph & Append Ledger", True),
            ("\n(test_normalization_flow.py,\ntest_anchor_resolver.py,\ntest_ledger.py)", False)
        ],
        "col1": [
            ("Simulated multi-source telemetry flow: Jira issue + GitHub PR ingestion → anchor resolution → ledger attachment and soft-unlinking.", False)
        ],
        "col2": [
            ("Unified multi-source events into canonical ChangeEvent; state transitioned in_progress → merged; ", False),
            ("0 destructive SQL DELETEs; ", True),
            ("soft-unlink requires audit reason.", False)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    },
    {
        "col0": [
            ("6. Suggestion & Contracts", True),
            ("\n(test_suggestion_ranker.py,\ntest_contracts.py,\ntest_models.py)", False)
        ],
        "col1": [
            ("Evaluated 4-factor ranking formula (S = 0.35S_person + 0.20S_time + 0.25S_path + 0.20S_text) and Pydantic v2 contract boundaries.", False)
        ],
        "col2": [
            ("Rank scores calibrated strictly [0.0, 1.0]; ", False),
            ("12,000-token EvidencePack bounding ceiling enforced; ", True),
            ("all 34 database schemas & cascade rules validated.", False)
        ],
        "col3": [
            ("Passed\n(100%)", True)
        ]
    }
]

for row_idx, r_conf in enumerate(rows_config, start=1):
    for col_idx, col_key in enumerate(["col0", "col1", "col2", "col3"]):
        cell = table.cell(row_idx, col_idx)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.margin_left = Emu(49788)
        cell.margin_right = Emu(49788)
        cell.margin_top = Emu(24894)
        cell.margin_bottom = Emu(24894)
        
        p = cell.text_frame.paragraphs[0]
        p.text = ""
        if col_idx == 3:
            p.alignment = PP_ALIGN.CENTER
        else:
            p.alignment = PP_ALIGN.LEFT
            
        chunks = r_conf[col_key]
        for text_chunk, is_bold in chunks:
            run = p.add_run()
            run.text = text_chunk
            run.font.name = "Times New Roman"
            run.font.bold = is_bold
            if col_idx == 0:
                run.font.size = Pt(9.5) if is_bold else Pt(8.5)
            elif col_idx == 3:
                run.font.size = Pt(10)
                run.font.bold = True
                run.font.color.rgb = RGBColor(0, 102, 0)
            else:
                run.font.size = Pt(9)

prs.save(ppt_path)
print("Saved presentation successfully!")

# Export slide 11 to PNG for visual verification
ppt_app = win32com.client.Dispatch('PowerPoint.Application')
prs_app = ppt_app.Presentations.Open(ppt_path, WithWindow=False)
prs_app.Slides(11).Export(os.path.abspath(r'd:\Projects\LaunchGraph\scratch\ppt_slides\slide_11_test.png'), 'PNG', 1920, 1080)
prs_app.Close()
ppt_app.Quit()
print("Slide 11 exported successfully!")
