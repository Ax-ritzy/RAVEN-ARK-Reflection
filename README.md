# Reflection AI Assessment System

A production-grade, dual-portal academic reflection evaluation platform powered by Supabase PostgreSQL, Next.js, and a deterministic FastAPI assessment engine.

---

## Architecture Overview

```
                      +-----------------------------+
                      |    Authoritative Storage    |
                      |   Supabase PostgreSQL RLS   |
                      |    + Supabase Storage       |
                      +--------------+--------------+
                                     |
                +--------------------+--------------------+
                |                                         |
   +------------v-------------+              +------------v-------------+
   |      Student Portal      |              |  Professor Admin Portal  |
   | Next.js 14+ (App Router) |              | Next.js 14+ (App Router) |
   |  - Student Auth & USN    |              |  - Provision Student Auth|
   |  - Open Session List     |              |  - Manage Sessions       |
   |  - Reflection Submission |              |  - Reference Library     |
   |  - 500-char verification |              |  - Mark Overrides        |
   |  - Grade & Feedback View |              |  - Excel Exports (.xlsx) |
   +------------+-------------+              +------------+-------------+
                |                                         |
                +--------------------+--------------------+
                                     |
                       +-------------v--------------+
                       | FastAPI Assessment Service |
                       |  - TXT, DOCX, PDF extract  |
                       |  - Multi-Ref Similarity    |
                       |  - 5 Distinct Keywords    |
                       |  - Score = Mark (0-5)  |
                       |  - openpyxl XLSX Exporter  |
                       +-------------+--------------+
                                     |
                       +-------------v--------------+
                       | Future RAVEN Integration   |
                       |  - Outbound Worker Client  |
                       |  - Non-blocking Queue      |
                       |  - Graceful Fallback       |
                       +----------------------------+
```

## Directory Structure

```
.
├── student-portal/          # Independent Student Next.js Web Application
├── professor-portal/        # Independent Professor Admin Next.js Web Application
├── backend/                 # FastAPI Document Extraction & Assessment Service
├── integrations/
│   └── raven/              # Dedicated RAVEN Agent Integration Layer
├── database/
│   ├── migrations/          # Versioned SQL migrations (Schema, RLS, Storage)
│   └── seed/                # Seed script for initial setup & verification
├── docs/                    # Architecture, deployment, database, and setup guides
├── tests/                   # Automated unit, integration, and scoring tests
├── .env.example             # Environment variable template
└── README.md
```

## Core Invariants & Rules

1. **Deterministic Scoring:**
   - Reference Score = number of distinct reference keywords found in the reflection (0 to 15).
   - Session Mark = $\frac{\text{Reference Score}}{5} \times 5 = (0.00 to 5.00).
   - Repeated keywords earn no additional points.
2. **Strict Character Limit:**
   - Maximum 500 characters after extracting reflection body (ignoring document metadata and filenames).
3. **Multi-Reference Resolution:**
   - If a session has multiple references, the single highest-similarity eligible reference is selected.
   - If similarity $< \tau_{\min}$ (0.35), the assessment is flagged as `NEEDS_REVIEW`.
4. **Authoritative Admin Control:**
   - Professors provision real Supabase Auth accounts for students linked to their USN.
   - Professors can override AI marks while preserving the original AI mark, audit reason, and timestamp.
5. **Excel Reports:**
   - Generates authentic `.xlsx` reports via `openpyxl`: Session Assessment Sheet and Master Student Performance Sheet (with distinct absent vs assessed zeroes).
6. **Future RAVEN Independence:**
   - RAVEN is fully decoupled. The platform operates normally with deterministic scoring even when RAVEN is offline.
