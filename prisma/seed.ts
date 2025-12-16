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

  console.log("🌱 Seeding product categories...");

  const categories = [
    "Software",
    "Service",
    "Printers",
    "Locks",
    "Laptop",
    "Point of Sale",
    "Desktop",
  ];

  for (const categoryName of categories) {
    const category = await prisma.productCategory.upsert({
      where: { name: categoryName },
      update: {},
      create: {
        name: categoryName,
        status: "active",
      },
    });
    console.log(
      `✅ Created/Updated category: ${category.name} (${category.id})`
    );
  }

  console.log("🌱 Seeding expense categories...");

  const expenseCategories = [
    { name: "Transport", description: "Travel, fuel, taxi, public transport" },
    { name: "Meals & Entertainment", description: "Lunch, dinner, client meals" },
    { name: "Office Supplies", description: "Stationery, printing, supplies" },
    { name: "Utilities", description: "Electricity, water, internet, phone bills" },
    { name: "Rent", description: "Office rent and related costs" },
    { name: "Equipment", description: "Hardware, tools, machinery" },
    { name: "Software & Subscriptions", description: "Software licenses, SaaS subscriptions" },
    { name: "Marketing", description: "Advertising, promotional materials" },
    { name: "Professional Services", description: "Legal, accounting, consulting fees" },
    { name: "Insurance", description: "Business insurance premiums" },
    { name: "Training & Development", description: "Courses, certifications, workshops" },
    { name: "Repairs & Maintenance", description: "Equipment repairs, office maintenance" },
    { name: "Communication", description: "Airtime, data bundles, postage" },
    { name: "Accommodation", description: "Hotel, lodging for business trips" },
    { name: "Bank Charges", description: "Transaction fees, account charges" },
    { name: "Taxes & Licenses", description: "Business permits, regulatory fees" },
    { name: "Miscellaneous", description: "Other uncategorized expenses" },
  ];

  for (const expCategory of expenseCategories) {
    const category = await prisma.expenseCategory.upsert({
      where: { name: expCategory.name },
      update: { description: expCategory.description },
      create: {
        name: expCategory.name,
        description: expCategory.description,
        status: "active",
      },
    });
    console.log(
      `✅ Created/Updated expense category: ${category.name} (${category.id})`
    );
  }

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
