PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO products(id,name,locale,settings_json,created_at) VALUES('prod_e2e','CarryPet E2E Demo','ja-JP','{}',datetime('now'));
INSERT OR IGNORE INTO accounts(id,platform,handle,product_id,source_url,destination,active,created_at) VALUES('acct_e2e','instagram','carrypet.e2e','prod_e2e','https://www.instagram.com/carrypet.jp/',1,1,datetime('now'));
INSERT OR IGNORE INTO source_posts(id,account_id,platform_post_id,source_url,caption,rights_status,media_key,metadata_json,ingested_at) VALUES
('src_e2e_1','acct_e2e','synthetic-1','https://www.instagram.com/carrypet.jp/','E2E source 1','permitted',NULL,'{}',datetime('now')),
('src_e2e_2','acct_e2e','synthetic-2','https://www.instagram.com/carrypet.jp/','E2E source 2','permitted',NULL,'{}',datetime('now')),
('src_e2e_3','acct_e2e','synthetic-3','https://www.instagram.com/carrypet.jp/','E2E source 3','permitted',NULL,'{}',datetime('now')),
('src_e2e_4','acct_e2e','synthetic-4','https://www.instagram.com/carrypet.jp/','E2E source 4','permitted',NULL,'{}',datetime('now'));
INSERT OR IGNORE INTO clips(id,source_post_id,start_ms,end_ms,tags_json,features_json,quality_score,created_at) VALUES
('clip_e2e_1','src_e2e_1',0,2400,'["Hook"]','{}',1,datetime('now')),
('clip_e2e_2','src_e2e_2',0,2400,'["Problem"]','{}',1,datetime('now')),
('clip_e2e_3','src_e2e_3',0,2400,'["Demonstration"]','{}',1,datetime('now')),
('clip_e2e_4','src_e2e_4',0,2400,'["Benefit","CTA"]','{}',1,datetime('now'));
INSERT OR REPLACE INTO creatives(id,product_id,account_id,angle,hook,caption,status,media_key,recipe_json,qa_json,created_at,updated_at) VALUES('creative_e2e','prod_e2e','acct_e2e','problem','もう抱っこで疲れない','抱っこの負担をもっと軽く。CarryPetなら、いつものお出かけが快適に。','pending_approval','creatives/e2e-demo.mp4','{"clips":["clip_e2e_1","clip_e2e_2","clip_e2e_3","clip_e2e_4"],"audio":"replaced","format":"1080x1920"}','{"passed":true,"duration_ms":9600,"distinct_sources":4}',datetime('now'),datetime('now'));
INSERT OR REPLACE INTO creative_clips(creative_id,clip_id,position,trim_start_ms,trim_end_ms) VALUES
('creative_e2e','clip_e2e_1',0,0,2400),('creative_e2e','clip_e2e_2',1,0,2400),('creative_e2e','clip_e2e_3',2,0,2400),('creative_e2e','clip_e2e_4',3,0,2400);
