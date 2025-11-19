use serde::{Deserialize, Serialize};
use validator::Validate;

// Constants from VALIDATION_LIMITS
const STRING_MAX_LENGTH: u64 = 2048;
const SHORT_STRING_MAX_LENGTH: u64 = 255;
const SESSION_ID_MAX_LENGTH: u64 = 128;
const TEXT_MAX_LENGTH: u64 = 2048;

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct BaseEventPayload {
    #[validate(length(max = 512))]
    pub eventId: Option<String>,

    #[validate(length(max = 255))] // SHORT_STRING_MAX_LENGTH
    pub name: String,

    #[validate(length(max = 128))] // SESSION_ID_MAX_LENGTH (used for anonymousId too typically?)
    pub anonymousId: String,

    #[validate(length(max = 128))] // SESSION_ID_MAX_LENGTH
    pub sessionId: String,

    pub sessionStartTime: i64,
    pub timestamp: i64,

    #[validate(length(max = 2048))] // PATH_MAX_LENGTH / STRING_MAX_LENGTH
    pub path: String,

    #[validate(length(max = 2048))]
    pub title: String,

    #[validate(length(max = 2048))]
    pub referrer: String,

    pub screen_resolution: String,
    pub viewport_size: String,

    #[validate(length(max = 64))]
    pub timezone: String,

    #[validate(length(max = 35))]
    pub language: String,

    // Connection info
    pub connection_type: Option<String>,
    pub rtt: Option<f64>,
    pub downlink: Option<f64>,

    // UTM parameters
    #[validate(length(max = 512))]
    pub utm_source: Option<String>,
    #[validate(length(max = 512))]
    pub utm_medium: Option<String>,
    #[validate(length(max = 512))]
    pub utm_campaign: Option<String>,
    #[validate(length(max = 512))]
    pub utm_term: Option<String>,
    #[validate(length(max = 512))]
    pub utm_content: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct TrackEventPayload {
    #[serde(flatten)]
    #[validate(nested)]
    pub base: BaseEventPayload,

    // Performance metrics
    pub load_time: Option<f64>,
    pub dom_ready_time: Option<f64>,
    pub dom_interactive: Option<f64>,
    pub ttfb: Option<f64>,
    pub request_time: Option<f64>,
    pub render_time: Option<f64>,
    pub redirect_time: Option<f64>,
    pub domain_lookup_time: Option<f64>,
    pub connection_time: Option<f64>,

    // Engagement metrics
    pub page_count: Option<i32>,
    pub time_on_page: Option<f64>,
    pub scroll_depth: Option<f64>,
    pub interaction_count: Option<i32>,
    pub is_bounce: Option<i32>,   // 0 or 1
    pub exit_intent: Option<i32>, // 0 or 1
    pub has_exit_intent: Option<bool>,
    pub page_size: Option<i32>,

    // Link tracking
    pub href: Option<String>,
    pub text: Option<String>,

    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct MinimalBasePayload {
    #[validate(length(max = 512))]
    pub eventId: Option<String>,

    #[validate(length(max = 128))]
    pub anonymousId: String,

    #[validate(length(max = 128))]
    pub sessionId: String,

    pub timestamp: i64,

    #[validate(length(max = 2048))]
    pub path: String,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct ContextBasePayload {
    #[serde(flatten)]
    #[validate(nested)]
    pub base: MinimalBasePayload,

    pub screen_resolution: Option<String>,
    pub viewport_size: Option<String>,
    pub connection_type: Option<String>,
    pub language: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct ErrorEventPayload {
    #[serde(flatten)]
    #[validate(nested)]
    pub base: ContextBasePayload,

    #[validate(length(max = 2048))]
    pub message: String,

    #[validate(length(max = 2048))]
    pub filename: Option<String>,

    pub lineno: Option<i32>,
    pub colno: Option<i32>,

    #[validate(length(max = 2048))]
    pub stack: Option<String>,

    #[validate(length(max = 255))]
    pub errorType: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct WebVitalsEventPayload {
    #[serde(flatten)]
    #[validate(nested)]
    pub base: ContextBasePayload,

    pub fcp: Option<f64>,
    pub lcp: Option<f64>,
    pub cls: Option<f64>,
    pub fid: Option<f64>,
    pub inp: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct CustomEventPayload {
    #[validate(length(max = 512))]
    pub eventId: Option<String>,

    #[validate(length(max = 255))]
    pub name: String,

    #[validate(length(max = 128))]
    pub anonymousId: Option<String>,

    #[validate(length(max = 128))]
    pub sessionId: Option<String>,

    pub timestamp: Option<i64>,

    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct OutgoingLinkPayload {
    #[validate(length(max = 512))]
    pub eventId: String,

    #[validate(length(max = 128))]
    pub anonymousId: Option<String>,

    #[validate(length(max = 128))]
    pub sessionId: Option<String>,

    pub timestamp: Option<i64>,

    #[validate(length(max = 2048))] // PATH_MAX_LENGTH
    pub href: String,

    #[validate(length(max = 2048))] // TEXT_MAX_LENGTH
    pub text: Option<String>,

    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(untagged)]
#[serde(rename_all = "snake_case")]
pub enum Event {
    #[serde(alias = "track")]
    Track(TrackEventPayload),
    Error(ErrorEventPayload),
    WebVitals(WebVitalsEventPayload),
    Custom(CustomEventPayload),
    OutgoingLink(OutgoingLinkPayload),
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum IngestRequest {
    Single(Event),
    Batch(Vec<Event>),
}
