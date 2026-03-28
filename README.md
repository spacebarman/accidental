# accidendal
Page and a tools for the album Accidental by Spacebarman
https://www.spacebarman.com/accidental

## GA4 setup automation

This repo includes GA4 schema automation files:

- `ga4_schema.json`: custom dimensions, metrics, and key events.
- `setup_ga4.py`: provisions the schema via Google Analytics Admin API.

### Prerequisites

1. Update `propertyId` in `ga4_schema.json` with your numeric GA4 Property ID.
2. Create a Google service account with GA4 Admin access to that property.
3. Export credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

4. Install dependency:

```bash
pip install google-analytics-admin
```

### Usage

Dry-run (no changes):

```bash
python setup_ga4.py --config ga4_schema.json
```

Apply changes:

```bash
python setup_ga4.py --config ga4_schema.json --apply
```