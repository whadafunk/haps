ALTER TABLE "post_photos" DROP CONSTRAINT "post_photos_photo_id_fkey";--> statement-breakpoint
ALTER TABLE "post_photos" ADD CONSTRAINT "post_photos_photo_id_album_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."album_photos"("id") ON DELETE cascade ON UPDATE no action;
