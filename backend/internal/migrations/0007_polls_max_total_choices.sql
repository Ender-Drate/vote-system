-- 0007_polls_max_total_choices.sql —— 整份投票的选项总数上限
-- 0 表示不限；>0 时，一次提交在所有单选/多选题上勾选的总项数不得超过它。
-- 排序题要求为每个选项排位、简答题不是选项，两者都不计入这个总数。
ALTER TABLE polls ADD COLUMN max_total_choices INT NOT NULL DEFAULT 0;
