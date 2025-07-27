use serde::{Deserialize, Serialize};
use tauri::command;
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use reqwest::Client;
use scraper::{Html, Selector};
use url::Url;
use log::{info, error, warn};
use std::time::Instant;
use tokio::time::{sleep, Duration as TokioDuration};

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS: u64 = 2000; // 2 seconds between requests
static mut LAST_REQUEST_TIME: Option<Instant> = None;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub url: String,
    pub source: String, // "wikipedia", "duckduckgo", etc.
    pub relevance_score: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResults {
    pub query: String,
    pub results: Vec<SearchResult>,
    pub total_results: usize,
    pub search_time_ms: u64,
    pub sources_used: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageContent {
    pub url: String,
    pub title: String,
    pub content: String,
    pub meta_description: Option<String>,
    pub headings: Vec<String>,
    pub links: Vec<String>,
    pub images: Vec<String>,
    pub word_count: usize,
    pub extracted_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RobotsTxtRules {
    pub allowed: bool,
    pub crawl_delay: Option<u64>,
    pub user_agent_rules: HashMap<String, bool>,
    pub sitemap_urls: Vec<String>,
}

// Web search with prioritized sources
#[command]
pub async fn search_web(query: String) -> Result<SearchResults, String> {
    info!("🔍 Starting web search for query: {}", query);
    let start_time = Instant::now();
    
    // Apply rate limiting
    apply_rate_limit().await;
    
    let mut all_results = Vec::new();
    let mut sources_used = Vec::new();
    
    // 1. Try Wikipedia first (most reliable for factual information)
    match search_wikipedia(&query).await {
        Ok(mut wikipedia_results) => {
            info!("✅ Wikipedia search returned {} results", wikipedia_results.len());
            all_results.append(&mut wikipedia_results);
            sources_used.push("wikipedia".to_string());
        }
        Err(e) => {
            warn!("⚠️ Wikipedia search failed: {}", e);
        }
    }
    
    // 2. Try DuckDuckGo for additional results
    if all_results.len() < 5 {
        match search_duckduckgo(&query).await {
            Ok(mut ddg_results) => {
                info!("✅ DuckDuckGo search returned {} results", ddg_results.len());
                all_results.append(&mut ddg_results);
                sources_used.push("duckduckgo".to_string());
            }
            Err(e) => {
                warn!("⚠️ DuckDuckGo search failed: {}", e);
            }
        }
    }
    
    // Sort by relevance score and limit results
    all_results.sort_by(|a, b| b.relevance_score.partial_cmp(&a.relevance_score).unwrap());
    all_results.truncate(10); // Limit to top 10 results
    
    let search_time = start_time.elapsed().as_millis() as u64;
    
    info!("🔍 Web search completed in {}ms with {} results from {} sources", 
          search_time, all_results.len(), sources_used.len());
    
    Ok(SearchResults {
        query,
        total_results: all_results.len(),
        results: all_results,
        search_time_ms: search_time,
        sources_used,
    })
}

// Navigate to URL with validation
#[command]
pub async fn navigate_to_url(url: String) -> Result<(), String> {
    info!("🌐 Navigating to URL: {}", url);
    
    // Validate URL format
    let parsed_url = Url::parse(&url)
        .map_err(|e| format!("Invalid URL format: {}", e))?;
    
    // Check if URL is safe (basic validation)
    if !is_safe_url(&parsed_url) {
        return Err("URL is not safe for navigation".to_string());
    }
    
    // Apply rate limiting
    apply_rate_limit().await;
    
    info!("✅ URL validation passed for: {}", url);
    Ok(())
}

// Extract page content with rate limiting
#[command]
pub async fn extract_page_content(url: String) -> Result<PageContent, String> {
    info!("📄 Extracting content from: {}", url);
    
    // Validate URL
    let parsed_url = Url::parse(&url)
        .map_err(|e| format!("Invalid URL: {}", e))?;
    
    // Check robots.txt compliance
    match check_robots_txt_compliance(&parsed_url).await {
        Ok(rules) => {
            if !rules.allowed {
                return Err("Robots.txt disallows crawling this URL".to_string());
            }
            
            // Apply additional delay if specified in robots.txt
            if let Some(delay) = rules.crawl_delay {
                sleep(TokioDuration::from_secs(delay)).await;
            }
        }
        Err(e) => {
            warn!("⚠️ Could not check robots.txt: {}", e);
        }
    }
    
    // Apply rate limiting
    apply_rate_limit().await;
    
    // Fetch and parse content
    let client = Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "Privacy-AI-Assistant/1.0 (Educational Purpose)")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;
    
    let html_content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    let page_content = parse_html_content(&url, &html_content)?;
    
    info!("✅ Successfully extracted {} words from {}", page_content.word_count, url);
    Ok(page_content)
}

// Check robots.txt rules
#[command]
pub async fn check_robots_txt(domain: String) -> Result<RobotsTxtRules, String> {
    info!("🤖 Checking robots.txt for domain: {}", domain);
    
    let robots_url = format!("https://{}/robots.txt", domain);
    check_robots_txt_compliance(&Url::parse(&robots_url).unwrap()).await
}

// Helper functions

async fn apply_rate_limit() {
    unsafe {
        if let Some(last_time) = LAST_REQUEST_TIME {
            let elapsed = last_time.elapsed();
            if elapsed.as_millis() < RATE_LIMIT_DELAY_MS as u128 {
                let sleep_time = RATE_LIMIT_DELAY_MS - elapsed.as_millis() as u64;
                sleep(TokioDuration::from_millis(sleep_time)).await;
            }
        }
        LAST_REQUEST_TIME = Some(Instant::now());
    }
}

async fn search_wikipedia(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::new();
    let search_url = format!(
        "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
        urlencoding::encode(query)
    );
    
    let response = client
        .get(&search_url)
        .header("User-Agent", "Privacy-AI-Assistant/1.0")
        .send()
        .await
        .map_err(|e| format!("Wikipedia API error: {}", e))?;
    
    if response.status().is_success() {
        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Wikipedia response: {}", e))?;
        
        if let (Some(title), Some(extract), Some(url)) = (
            json["title"].as_str(),
            json["extract"].as_str(),
            json["content_urls"]["desktop"]["page"].as_str(),
        ) {
            Ok(vec![SearchResult {
                title: title.to_string(),
                snippet: extract.to_string(),
                url: url.to_string(),
                source: "wikipedia".to_string(),
                relevance_score: 0.9, // High relevance for Wikipedia
            }])
        } else {
            Ok(vec![])
        }
    } else {
        Ok(vec![])
    }
}

async fn search_duckduckgo(query: &str) -> Result<Vec<SearchResult>, String> {
    // Note: DuckDuckGo doesn't provide a public API for search results
    // This is a placeholder implementation
    // In a real implementation, you might use web scraping or alternative search APIs
    
    warn!("DuckDuckGo search not implemented - using placeholder");
    Ok(vec![])
}

fn is_safe_url(url: &Url) -> bool {
    // Basic safety checks
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }
    
    // Check for suspicious domains (basic blacklist)
    let host = url.host_str().unwrap_or("");
    let suspicious_domains = ["malware.com", "phishing.com"]; // Extend as needed
    
    !suspicious_domains.iter().any(|&domain| host.contains(domain))
}

async fn check_robots_txt_compliance(url: &Url) -> Result<RobotsTxtRules, String> {
    let domain = url.host_str().ok_or("Invalid domain")?;
    let robots_url = format!("https://{}/robots.txt", domain);
    
    let client = Client::new();
    let response = client
        .get(&robots_url)
        .header("User-Agent", "Privacy-AI-Assistant/1.0")
        .send()
        .await;
    
    match response {
        Ok(resp) if resp.status().is_success() => {
            let robots_content = resp.text().await.unwrap_or_default();
            parse_robots_txt(&robots_content)
        }
        _ => {
            // If robots.txt is not found, assume crawling is allowed
            Ok(RobotsTxtRules {
                allowed: true,
                crawl_delay: Some(2), // Default 2-second delay
                user_agent_rules: HashMap::new(),
                sitemap_urls: vec![],
            })
        }
    }
}

fn parse_robots_txt(content: &str) -> Result<RobotsTxtRules, String> {
    let mut allowed = true;
    let mut crawl_delay = None;
    let mut user_agent_rules = HashMap::new();
    let mut sitemap_urls = Vec::new();
    
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("Disallow:") && line.contains("*") {
            allowed = false;
        } else if line.starts_with("Crawl-delay:") {
            if let Some(delay_str) = line.split(':').nth(1) {
                crawl_delay = delay_str.trim().parse().ok();
            }
        } else if line.starts_with("Sitemap:") {
            if let Some(sitemap_url) = line.split(':').nth(1) {
                sitemap_urls.push(sitemap_url.trim().to_string());
            }
        }
    }
    
    Ok(RobotsTxtRules {
        allowed,
        crawl_delay,
        user_agent_rules,
        sitemap_urls,
    })
}

fn parse_html_content(url: &str, html: &str) -> Result<PageContent, String> {
    let document = Html::parse_document(html);
    
    // Extract title
    let title_selector = Selector::parse("title").unwrap();
    let title = document
        .select(&title_selector)
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_else(|| "No title".to_string());
    
    // Extract meta description
    let meta_selector = Selector::parse("meta[name='description']").unwrap();
    let meta_description = document
        .select(&meta_selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string());
    
    // Extract main content (paragraphs)
    let content_selector = Selector::parse("p, article, main").unwrap();
    let content = document
        .select(&content_selector)
        .map(|el| el.text().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ");
    
    // Extract headings
    let heading_selector = Selector::parse("h1, h2, h3, h4, h5, h6").unwrap();
    let headings = document
        .select(&heading_selector)
        .map(|el| el.text().collect::<String>())
        .collect();
    
    // Extract links
    let link_selector = Selector::parse("a[href]").unwrap();
    let links = document
        .select(&link_selector)
        .filter_map(|el| el.value().attr("href"))
        .map(|s| s.to_string())
        .collect();
    
    // Extract images
    let img_selector = Selector::parse("img[src]").unwrap();
    let images = document
        .select(&img_selector)
        .filter_map(|el| el.value().attr("src"))
        .map(|s| s.to_string())
        .collect();
    
    let word_count = content.split_whitespace().count();
    
    Ok(PageContent {
        url: url.to_string(),
        title,
        content,
        meta_description,
        headings,
        links,
        images,
        word_count,
        extracted_at: Utc::now(),
    })
}
