CREATE VIRTUAL TABLE `usda_foods_fts` USING fts5(
	description,
	content=usda_foods,
	content_rowid=fdc_id
);