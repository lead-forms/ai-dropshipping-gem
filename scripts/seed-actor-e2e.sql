PRAGMA foreign_keys = OFF;
DELETE FROM metrics WHERE publication_id IN (SELECT id FROM publications WHERE account_id='acct_actor_e2e');
DELETE FROM publications WHERE account_id='acct_actor_e2e';
DELETE FROM creative_clips WHERE creative_id IN (SELECT id FROM creatives WHERE account_id='acct_actor_e2e');
DELETE FROM creatives WHERE account_id='acct_actor_e2e';
DELETE FROM clips WHERE source_post_id IN (SELECT id FROM source_posts WHERE account_id='acct_actor_e2e');
DELETE FROM jobs WHERE entity_id IN ('acct_actor_e2e','src_actor_e2e_1','src_actor_e2e_2');
DELETE FROM source_posts WHERE account_id='acct_actor_e2e';
DELETE FROM accounts WHERE id='acct_actor_e2e';
INSERT INTO accounts(id,platform,handle,source_url,destination,active,created_at) VALUES('acct_actor_e2e','instagram','carrypet.actor-e2e','https://www.instagram.com/carrypet.jp/',1,1,datetime('now'));
INSERT INTO source_posts(id,account_id,platform_post_id,source_url,caption,rights_status,media_key,metadata_json,ingested_at) VALUES
('src_actor_e2e_1','acct_actor_e2e','synthetic-actor-1','https://www.instagram.com/carrypet.jp/','Actor E2E source 1','owned','sources/e2e/source1.mp4','{}',datetime('now')),
('src_actor_e2e_2','acct_actor_e2e','synthetic-actor-2','https://www.instagram.com/carrypet.jp/','Actor E2E source 2','owned','sources/e2e/source2.mp4','{}',datetime('now'));
PRAGMA foreign_keys = ON;
