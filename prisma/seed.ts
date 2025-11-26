import { PrismaClient } from "@prisma/client";
import { generateTempPassword, hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding roles...");

  // Create DIRECTOR role
  const director = await prisma.role.upsert({
    where: { name: "DIRECTOR" },
    update: {},
    create: {
      name: "DIRECTOR",
    },
  });

  console.log("✅ Created DIRECTOR role:", director.id);

  // Create STAFF role
  const staff = await prisma.role.upsert({
    where: { name: "STAFF" },
    update: {},
    create: {
      name: "STAFF",
    },
  });

  console.log("✅ Created STAFF role:", staff.id);

  console.log("🌱 Seeding employee...");

  // Generate random password
  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  // Set expiration date (7 days from now)
  const tempPasswordExpiresAt = new Date();
  tempPasswordExpiresAt.setDate(tempPasswordExpiresAt.getDate() + 7);

  // Create first employee
  const employee = await prisma.employee.upsert({
    where: { email: "ndutagrace25@gmail.com" },
    update: {},
    create: {
      email: "ndutagrace25@gmail.com",
      firstName: "Grace",
      lastName: "Nduta",
      position: "Software Engineer",
      department: "SOFTWARE",
      phone: "+254708807403",
      password: hashedPassword,
      tempPassword: tempPassword,
      tempPasswordExpiresAt: tempPasswordExpiresAt,
      roleId: director.id,
    },
    include: {
      role: true,
    },
  });

  console.log("✅ Created employee:", employee.email);
  console.log("🔑 Temporary password:", tempPassword);
  console.log("⏰ Password expires at:", tempPasswordExpiresAt.toISOString());

  console.log("🎉 Seeding completed!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error seeding:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
