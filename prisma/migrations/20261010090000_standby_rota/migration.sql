-- Weekend standby rota: ordered rotation members and one assignment per weekend
-- CreateTable
CREATE TABLE "standby_rotation_members" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standby_rotation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standby_weekends" (
    "id" TEXT NOT NULL,
    "weekend_start" DATE NOT NULL,
    "employee_id" TEXT NOT NULL,
    "original_employee_id" TEXT,
    "change_reason" TEXT,
    "changed_by_id" TEXT,
    "changed_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standby_weekends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "standby_rotation_members_employee_id_key" ON "standby_rotation_members"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "standby_weekends_weekend_start_key" ON "standby_weekends"("weekend_start");

-- CreateIndex
CREATE INDEX "standby_weekends_employee_id_idx" ON "standby_weekends"("employee_id");

-- AddForeignKey
ALTER TABLE "standby_rotation_members" ADD CONSTRAINT "standby_rotation_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standby_weekends" ADD CONSTRAINT "standby_weekends_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standby_weekends" ADD CONSTRAINT "standby_weekends_original_employee_id_fkey" FOREIGN KEY ("original_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standby_weekends" ADD CONSTRAINT "standby_weekends_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

