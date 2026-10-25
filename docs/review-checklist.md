# Review checklist

Things only the user can check, by milestone.

## M0

### Phone and live checks

- [ ] Open the Pages URL on a phone: D1 shows, with the honest note and the three choices.
- [ ] Staff, Client admin and Provider each open with their navigation; the tabs and More work with a thumb.
- [ ] Long-press the Demo badge: the presenter panel opens; Fast-forward and Reset demo work; the Demo menu shows the version and build date.
- [ ] Dark mode and large text on the phone look right.
- [ ] `?reset=1` on the URL resets the demo.
- [ ] On GitHub: the `checks` job passes, the deploy workflow publishes after a merge to main, and Pages is set to deploy from GitHub Actions.

### Awaiting review

- [ ] Draft nursery content: the renewal periods (safeguarding 24 months, paediatric first aid 36, food hygiene 36) are placeholders marked VERIFY in the nursery pack.
- [ ] Action versions in `.github/workflows/deploy.yml` (configure-pages v6, upload-pages-artifact v5, deploy-pages v5) could not be checked against the releases pages from here; confirm they exist (logged in docs/decisions.md).
- [ ] Free GitHub Pages usually needs a public repository (build pack 11.3, VERIFY).
