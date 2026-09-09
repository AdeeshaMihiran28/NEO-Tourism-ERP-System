ALTER TABLE "LeaveApproval"
ADD CONSTRAINT "LeaveApproval_approverUserId_fkey"
FOREIGN KEY ("approverUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
