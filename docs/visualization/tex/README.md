# LaTeX sources: DTaaS visualisation layer report

## Files

| File | Contents |
|---|---|
| `main.tex` | Document root: title, abstract, source note, `\input` of all sections |
| `preamble.tex` | Packages, colours, section styling, listings style, table helpers |
| `01-introduction.tex` | Context (incl. the deployed DTaaS service stack), goal, scope |
| `02-problem.tex` | Problem statement P1–P6, why obvious approaches fail, requirements R1–R11 |
| `03-architecture.tex` | Anchor/encode/sustain invariant, six-layer architecture, mapping onto dtaas-services, GitLab persistence, workspace desktop |
| `04-techniques.tex` | Techniques T1–T14 (incl. image substrate and live video) and the domain matrix |
| `05-packages.tex` | Package register, renderer verdicts, transport/platform packages, gaps, licence discrepancies |
| `06-implementation.tex` | Package layout, React surface, phases 0–6, milestones, risks |
| `07-evaluation.tex` | Fidelity/synchronicity, residual accuracy, registration error, video skew, human factors |
| `08-conclusion.tex` | Findings, positioning against the literature, next step |
| `09-appendix.tex` | Source provenance and extraction status, licence register |
| `references.bib` | Bibliography |

## Building

Compiled with MiKTeX (`pdflatex` + `bibtex`). Four passes are needed because the
document uses `natbib` and `longtable`:

```bash
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

or, if `latexmk` is installed:

```bash
latexmk -pdf main.tex
```

Packages used: `amsmath`, `amssymb`, `textcomp`, `geometry`, `microtype`, `booktabs`,
`longtable`, `tabularx`, `array`, `multirow`, `graphicx`, `xcolor` (with the `table`
option), `enumitem`, `listings`, `fancyhdr`, `titlesec`, `caption`, `natbib`,
`hyperref`.

Last build: **17 pages**, no undefined references or citations.

The document was condensed from an earlier 37-page draft. Content was
compressed, not dropped: all fourteen techniques, all eleven requirements, the
full architecture, the package register, the phase plan and the source
provenance are retained in shorter form. What was removed is per-technique
commercial-practice narrative, the full renderer comparison table (now a prose
paragraph), the per-file source-provenance table (now a paragraph) and the
expanded literature positioning.

## Output

`main.pdf` is the compiled document. A copy is published at the project root as
`../DTaaS-Visualisation-Layer.pdf`. That PDF is now generated from these
sources. Earlier drafts used a separate HTML-to-PDF route, which has been
removed so the sources and the PDF cannot diverge.

Build intermediates (`*.aux`, `*.log`, `*.bbl`, `*.blg`, `*.out`, `*.toc`) are not
kept in the repository.
