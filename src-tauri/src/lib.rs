// This file can be used for shared library functions
// Currently empty but prepared for future extensions

pub mod utils {
    use chrono::{DateTime, Utc};
    
    pub fn get_current_timestamp() -> DateTime<Utc> {
        Utc::now()
    }
    
    pub fn format_timestamp(timestamp: DateTime<Utc>) -> String {
        timestamp.format("%Y-%m-%d %H:%M:%S UTC").to_string()
    }
}
