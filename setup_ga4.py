#!/usr/bin/env python3
"""Provision GA4 custom dimensions, metrics, and key events from JSON config.

Usage:
  pip install google-analytics-admin
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
  python setup_ga4.py --config ga4_schema.json --apply

Run with no --apply for dry-run mode.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def load_ga_admin_sdk() -> tuple[Any, Any, Any, Any]:
    try:
        admin_module = importlib.import_module("google.analytics.admin_v1beta")
        types_module = importlib.import_module("google.analytics.admin_v1beta.types")
    except ImportError as exc:  # pragma: no cover
        print("Missing dependency: google-analytics-admin")
        print("Install with: pip install google-analytics-admin")
        raise SystemExit(1) from exc

    return (
        admin_module.AnalyticsAdminServiceClient,
        types_module.ConversionEvent,
        types_module.CustomDimension,
        types_module.CustomMetric,
    )


@dataclass(frozen=True)
class Result:
    created: int = 0
    skipped: int = 0


def load_config(config_path: Path) -> dict[str, Any]:
    with config_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValueError("Config root must be an object")

    if not payload.get("propertyId"):
        raise ValueError("Config must include non-empty propertyId")

    payload.setdefault("customDimensions", [])
    payload.setdefault("customMetrics", [])
    payload.setdefault("keyEvents", [])
    return payload


def property_name(property_id: str) -> str:
    cleaned = str(property_id).strip()
    if cleaned.startswith("properties/"):
        return cleaned
    return f"properties/{cleaned}"


def apply_custom_dimensions(
    client: Any,
    custom_dimension_type: Any,
    parent: str,
    items: list[dict[str, Any]],
    apply: bool,
) -> Result:
    existing = {
        dim.parameter_name: dim
        for dim in client.list_custom_dimensions(parent=parent)
    }

    created = 0
    skipped = 0
    for item in items:
        parameter_name = item["parameterName"]
        if parameter_name in existing:
            print(f"SKIP  customDimension {parameter_name} (already exists)")
            skipped += 1
            continue

        display_name = item["displayName"]
        description = item.get("description", "")
        scope_value = item.get("scope", "EVENT").upper()
        scope = custom_dimension_type.DimensionScope.EVENT
        if scope_value != "EVENT":
            raise ValueError(
                f"Unsupported custom dimension scope '{scope_value}' for {parameter_name}. "
                "Only EVENT scope is supported by this script."
            )

        print(f"CREATE customDimension {parameter_name} ({display_name})")
        if apply:
            client.create_custom_dimension(
                parent=parent,
                custom_dimension=custom_dimension_type(
                    parameter_name=parameter_name,
                    display_name=display_name,
                    description=description,
                    scope=scope,
                ),
            )
        created += 1

    return Result(created=created, skipped=skipped)


def apply_custom_metrics(
    client: Any,
    custom_metric_type: Any,
    parent: str,
    items: list[dict[str, Any]],
    apply: bool,
) -> Result:
    existing = {
        metric.parameter_name: metric
        for metric in client.list_custom_metrics(parent=parent)
    }

    created = 0
    skipped = 0
    for item in items:
        parameter_name = item["parameterName"]
        if parameter_name in existing:
            print(f"SKIP  customMetric    {parameter_name} (already exists)")
            skipped += 1
            continue

        display_name = item["displayName"]
        description = item.get("description", "")

        print(f"CREATE customMetric    {parameter_name} ({display_name})")
        if apply:
            client.create_custom_metric(
                parent=parent,
                custom_metric=custom_metric_type(
                    parameter_name=parameter_name,
                    display_name=display_name,
                    description=description,
                    measurement_unit=custom_metric_type.MeasurementUnit.STANDARD,
                    restricted_metric_type=[],
                ),
            )
        created += 1

    return Result(created=created, skipped=skipped)


def apply_key_events(
    client: Any,
    conversion_event_type: Any,
    parent: str,
    items: list[dict[str, Any]],
    apply: bool,
) -> Result:
    existing = {
        event.event_name: event
        for event in client.list_conversion_events(parent=parent)
    }

    created = 0
    skipped = 0
    for item in items:
        event_name = item["eventName"]
        if event_name in existing:
            print(f"SKIP  keyEvent        {event_name} (already exists)")
            skipped += 1
            continue

        print(f"CREATE keyEvent        {event_name}")
        if apply:
            client.create_conversion_event(
                parent=parent,
                conversion_event=conversion_event_type(event_name=event_name),
            )
        created += 1

    return Result(created=created, skipped=skipped)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Provision GA4 custom definitions from JSON config"
    )
    parser.add_argument(
        "--config",
        default="ga4_schema.json",
        help="Path to config JSON (default: ga4_schema.json)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes. Omit for dry-run mode.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Config not found: {config_path}")
        return 1

    config = load_config(config_path)
    parent = property_name(config["propertyId"])

    (
        analytics_admin_service_client,
        conversion_event_type,
        custom_dimension_type,
        custom_metric_type,
    ) = load_ga_admin_sdk()

    client = analytics_admin_service_client()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Mode: {mode}")
    print(f"Property: {parent}")

    dim_result = apply_custom_dimensions(
        client,
        custom_dimension_type,
        parent,
        config["customDimensions"],
        args.apply,
    )
    metric_result = apply_custom_metrics(
        client,
        custom_metric_type,
        parent,
        config["customMetrics"],
        args.apply,
    )
    key_event_result = apply_key_events(
        client,
        conversion_event_type,
        parent,
        config["keyEvents"],
        args.apply,
    )

    print("\nSummary")
    print(
        "Custom dimensions: created={created} skipped={skipped}".format(
            created=dim_result.created,
            skipped=dim_result.skipped,
        )
    )
    print(
        "Custom metrics:    created={created} skipped={skipped}".format(
            created=metric_result.created,
            skipped=metric_result.skipped,
        )
    )
    print(
        "Key events:        created={created} skipped={skipped}".format(
            created=key_event_result.created,
            skipped=key_event_result.skipped,
        )
    )

    if not args.apply:
        print("\nDry-run complete. Re-run with --apply to create resources.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
