UPDATE `actions` AS `older`
SET `status` = 'cancelled'
WHERE `older`.`status` IN ('todo', 'doing')
  AND EXISTS (
    SELECT 1
    FROM `actions` AS `newer`
    WHERE `newer`.`user_id` = `older`.`user_id`
      AND `newer`.`idea_id` = `older`.`idea_id`
      AND `newer`.`status` IN ('todo', 'doing')
      AND (
        `newer`.`created_at` > `older`.`created_at`
        OR (`newer`.`created_at` = `older`.`created_at` AND `newer`.`id` > `older`.`id`)
      )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_actions_one_active_per_idea` ON `actions` (`user_id`,`idea_id`) WHERE "actions"."status" IN ('todo', 'doing');
