mod models;
mod producer;

use axum::{
    extract::{Json, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use models::{Event, WebVitalsEventPayload, ErrorEventPayload, OutgoingLinkPayload};
use producer::KafkaProducer;
use serde_json::json;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use validator::Validate;

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();
    env_logger::init();

    let producer = KafkaProducer::new();

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([Method::POST, Method::GET, Method::OPTIONS, Method::PUT, Method::DELETE])
        .allow_headers([
            "Content-Type".parse().unwrap(),
            "Authorization".parse().unwrap(),
            "X-Requested-With".parse().unwrap(),
            "databuddy-client-id".parse().unwrap(),
            "databuddy-sdk-name".parse().unwrap(),
            "databuddy-sdk-version".parse().unwrap(),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/", post(ingest_single))
        .route("/vitals", post(ingest_vitals))
        .route("/errors", post(ingest_errors))
        .route("/outgoing", post(ingest_outgoing))
        .route("/batch", post(ingest_batch))
        .layer(cors)
        .with_state(producer);

    let addr = SocketAddr::from(([0, 0, 0, 0], 4000));
    println!("Starting ingestion service on port 4000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check(State(producer): State<KafkaProducer>) -> Json<serde_json::Value> {
    let connected = producer.check_health();
    let kafka_enabled = std::env::var("REDPANDA_BROKER").is_ok();

    Json(json!({
        "status": "ok",
        "version": "1.0.0",
        "producer_stats": {
            "messagesSent": 0, // We'd need atomic counters in the producer struct to track this real-time
            "errors": 0,       // Same for errors
            "connected": connected,
            "kafkaEnabled": kafka_enabled
        },
        "kafka": {
            "status": if connected { "healthy" } else { "unhealthy" },
            "enabled": kafka_enabled,
            "connected": connected
        }
    }))
}

async fn process_event(producer: KafkaProducer, event: Event) -> Response {
    if let Err(err) = validate_event(&event) {
        return (StatusCode::BAD_REQUEST, Json(json!({
            "status": "error",
            "message": "Validation failed",
            "details": err
        }))).into_response();
    }

    let event_type = get_event_type(&event);
    let topic = get_topic_name(event_type);
    let event_id = get_event_id(&event).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let payload_str = match serde_json::to_string(&event) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "status": "error",
            "message": "Serialization failed",
            "details": e.to_string()
        }))).into_response(),
    };

    match producer.send(topic, &event_id, &payload_str).await {
        Ok(_) => {
             Json(json!({
                "status": "success",
                "type": event_type
            })).into_response()
        },
        Err(e) => {
            println!("Failed to send event: {}", e);
             (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "status": "error",
                "message": "Failed to process event",
            }))).into_response()
        }
    }
}

async fn ingest_single(
    State(producer): State<KafkaProducer>,
    Json(payload): Json<Event>
) -> Response {
    process_event(producer, payload).await
}

async fn ingest_vitals(
    State(producer): State<KafkaProducer>,
    Json(payload): Json<WebVitalsEventPayload>
) -> Response {
    process_event(producer, Event::WebVitals(payload)).await
}

async fn ingest_errors(
    State(producer): State<KafkaProducer>,
    Json(payload): Json<ErrorEventPayload>
) -> Response {
    process_event(producer, Event::Error(payload)).await
}

async fn ingest_outgoing(
    State(producer): State<KafkaProducer>,
    Json(payload): Json<OutgoingLinkPayload>
) -> Response {
    process_event(producer, Event::OutgoingLink(payload)).await
}

async fn ingest_batch(
    State(producer): State<KafkaProducer>,
    Json(payload): Json<Vec<Event>>
) -> Response {
    let mut results = Vec::with_capacity(payload.len());
    let mut processed = 0;
    let mut track_count = 0;
    let mut error_count = 0;
    let mut web_vitals_count = 0;
    let mut custom_count = 0;
    let mut outgoing_link_count = 0;

    for event in payload {
        let event_id = get_event_id(&event).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let event_type = get_event_type(&event);

        if let Err(err) = validate_event(&event) {
             results.push(json!({
                "status": "error",
                "message": "Validation failed",
                "eventId": event_id,
                "eventType": event_type,
                "details": err
             }));
             continue;
        }
        
        let topic = get_topic_name(event_type);
        // Serialize
         let payload_str = match serde_json::to_string(&event) {
            Ok(s) => s,
            Err(_) => {
                 results.push(json!({
                    "status": "error",
                    "message": "Serialization failed",
                    "eventId": event_id,
                    "eventType": event_type,
                 }));
                 continue;
            }
        };

        match producer.send(topic, &event_id, &payload_str).await {
            Ok(_) => {
                processed += 1;
                match event {
                    Event::Track(_) => track_count += 1,
                    Event::Error(_) => error_count += 1,
                    Event::WebVitals(_) => web_vitals_count += 1,
                    Event::Custom(_) => custom_count += 1,
                    Event::OutgoingLink(_) => outgoing_link_count += 1,
                }

                results.push(json!({
                    "status": "success",
                    "type": event_type,
                    "eventId": event_id
                }));
            },
             Err(e) => {
                 println!("Failed to send batch event: {}", e);
                 results.push(json!({
                    "status": "error",
                    "message": "Failed to send to Kafka",
                    "eventId": event_id,
                    "eventType": event_type,
                 }));
            }
        }
    }

    Json(json!({
        "status": "success",
        "batch": true,
        "processed": processed,
        "batched": {
            "track": track_count,
            "error": error_count,
            "web_vitals": web_vitals_count,
            "custom": custom_count,
            "outgoing_link": outgoing_link_count
        },
        "results": results
    })).into_response()
}
fn validate_event(event: &Event) -> Result<(), validator::ValidationErrors> {
    match event {
        Event::Track(e) => e.validate(),
        Event::Error(e) => e.validate(),
        Event::WebVitals(e) => e.validate(),
        Event::Custom(e) => e.validate(),
        Event::OutgoingLink(e) => e.validate(),
    }
}
fn get_event_type(event: &Event) -> &'static str {
    match event {
        Event::Track(_) => "track",
        Event::Error(_) => "error",
        Event::WebVitals(_) => "web_vitals",
        Event::Custom(_) => "custom",
        Event::OutgoingLink(_) => "outgoing_link",
    }
}

fn get_topic_name(event_type: &str) -> &'static str {
    match event_type {
        "track" => "analytics-events",
        "error" => "analytics-errors",
        "web_vitals" => "analytics-web-vitals",
        "custom" => "analytics-custom-events",
        "outgoing_link" => "analytics-outgoing-links",
        _ => "analytics-events",
    }
}

fn get_event_id(event: &Event) -> Option<String> {
    match event {
        Event::Track(e) => e.base.eventId.clone(),
        Event::Error(e) => e.base.eventId.clone(),
        Event::WebVitals(e) => e.base.eventId.clone(),
        Event::Custom(e) => e.eventId.clone(),
        Event::OutgoingLink(e) => Some(e.eventId.clone()),
    }
}

