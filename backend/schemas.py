"""
Validation models for request payloads and persisted records.

Every value that reaches storage passes through one of these models, so
MongoDB documents and the on-disk history index share the same shape.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

RUN_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
SLIDE_ID_PATTERN = r"^[A-Z0-9]{5}$"

OutputKind = Literal["figma_data", "raw_predictions", "clean_predictions", "grid_layout", "page_json"]
OUTPUT_KINDS = ("figma_data", "raw_predictions", "clean_predictions", "grid_layout", "page_json")

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def clean_text(value: Optional[str], max_length: Optional[int] = None) -> Optional[str]:
    """Strip control characters and collapse whitespace; empty strings become None.

    When max_length is given the result is truncated (used for derived values
    such as design names); user input is left full-length so validation can reject it.
    """
    if value is None:
        return None
    cleaned = _CONTROL_CHARS.sub(" ", str(value)).strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    if max_length is not None:
        cleaned = cleaned[:max_length]
    return cleaned or None


class PackageDetails(BaseModel):
    """Optional metadata describing the generated dashboard slide package."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    subjectArea: str = Field("sales", min_length=1, max_length=40, pattern=SLUG_PATTERN)
    topic: str = Field("analytics", min_length=1, max_length=40, pattern=SLUG_PATTERN)
    slideName: str = Field("dashboard-summary", min_length=1, max_length=60, pattern=SLUG_PATTERN)
    slideId: Optional[str] = Field(None, pattern=SLIDE_ID_PATTERN)
    title: Optional[str] = Field(None, max_length=120)

    @field_validator("subjectArea", "topic", "slideName", mode="before")
    @classmethod
    def _lowercase_slug(cls, value: Any) -> Any:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("slideId", mode="before")
    @classmethod
    def _uppercase_slide_id(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip().upper()
            return value or None
        return value

    @field_validator("title", mode="before")
    @classmethod
    def _clean_title(cls, value: Any) -> Any:
        return clean_text(value) if isinstance(value, str) else value


class GenerateRequest(BaseModel):
    figmaJson: Optional[Dict[str, Any]] = None
    designId: Optional[str] = Field(None, max_length=120)
    packageDetails: Optional[PackageDetails] = None
    reclassify: Optional[bool] = False
    includeChrome: Optional[bool] = False
    runId: Optional[str] = Field(None, pattern=RUN_ID_PATTERN)


class RunRecord(BaseModel):
    """A saved analysis run: the summary of one completed generation."""

    model_config = ConfigDict(extra="ignore")

    runId: str = Field(pattern=RUN_ID_PATTERN)
    designName: str = Field(min_length=1, max_length=200)
    createdAt: datetime
    componentCount: int = Field(ge=0)
    widgetCount: int = Field(ge=0)
    tileCount: int = Field(ge=0)
    needAttention: int = Field(ge=0)
    status: Literal["completed"] = "completed"
    packageDetails: Optional[PackageDetails] = None

    @field_validator("designName", mode="before")
    @classmethod
    def _clean_design_name(cls, value: Any) -> Any:
        return clean_text(value, 200) or "Untitled design"

    @field_validator("createdAt")
    @classmethod
    def _assume_utc(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    def to_api(self) -> Dict[str, Any]:
        """Shape returned by the history API (kept compatible with the original index format)."""
        return {
            "runId": self.runId,
            "designName": self.designName,
            "timestamp": self.createdAt.isoformat(),
            "componentCount": self.componentCount,
            "widgetCount": self.widgetCount,
            "tileCount": self.tileCount,
            "needAttention": self.needAttention,
            "status": self.status,
            "packageDetails": self.packageDetails.model_dump(exclude_none=True) if self.packageDetails else None,
        }


# MongoDB server-side validation, mirrors RunRecord.
RUN_COLLECTION_VALIDATOR: Dict[str, Any] = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
            "runId", "designName", "createdAt", "componentCount", "widgetCount",
            "tileCount", "needAttention", "status", "outputs", "schemaVersion",
        ],
        "properties": {
            "runId": {"bsonType": "string", "pattern": RUN_ID_PATTERN},
            "designName": {"bsonType": "string", "minLength": 1, "maxLength": 200},
            "createdAt": {"bsonType": "date"},
            "componentCount": {"bsonType": ["int", "long"], "minimum": 0},
            "widgetCount": {"bsonType": ["int", "long"], "minimum": 0},
            "tileCount": {"bsonType": ["int", "long"], "minimum": 0},
            "needAttention": {"bsonType": ["int", "long"], "minimum": 0},
            "status": {"enum": ["completed"]},
            "packageDetails": {
                "bsonType": ["object", "null"],
                "properties": {
                    "subjectArea": {"bsonType": "string", "pattern": SLUG_PATTERN},
                    "topic": {"bsonType": "string", "pattern": SLUG_PATTERN},
                    "slideName": {"bsonType": "string", "pattern": SLUG_PATTERN},
                    "slideId": {"bsonType": "string", "pattern": SLIDE_ID_PATTERN},
                    "title": {"bsonType": "string", "maxLength": 120},
                },
            },
            "outputs": {
                "bsonType": "object",
                "properties": {kind: {"bsonType": "bool"} for kind in OUTPUT_KINDS},
            },
            "schemaVersion": {"bsonType": "int"},
        },
    }
}

OUTPUT_COLLECTION_VALIDATOR: Dict[str, Any] = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["runId", "kind", "encoding", "size", "data", "createdAt"],
        "properties": {
            "runId": {"bsonType": "string", "pattern": RUN_ID_PATTERN},
            "kind": {"enum": list(OUTPUT_KINDS)},
            "encoding": {"enum": ["gzip"]},
            "size": {"bsonType": ["int", "long"], "minimum": 0},
            "data": {"bsonType": "binData"},
            "createdAt": {"bsonType": "date"},
        },
    }
}
