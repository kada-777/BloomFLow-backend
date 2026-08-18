require("dotenv/config");

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const TEST_PASSWORD = "BloomFlow123!";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: "Cabang Jakarta Pusat" },
  }) ?? await prisma.branch.create({
    data: {
      name: "Cabang Jakarta Pusat",
      location: "Jakarta Pusat",
    },
  });

  const password = await bcrypt.hash(TEST_PASSWORD, 12);
  const users = [
    {
      email: "superadmin@bloomflow.test",
      role: "SUPERADMIN",
      branchId: null,
    },
    {
      email: "head-office@bloomflow.test",
      role: "STAFF_HEAD_OFFICE",
      branchId: null,
    },
    {
      email: "branch@bloomflow.test",
      role: "STAFF_BRANCH",
      branchId: branch.id,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        password,
        role: user.role,
        branchId: user.branchId,
        isActive: true,
      },
      create: {
        ...user,
        password,
      },
    });
  }

  console.log("Seeded 3 BloomFlow test users.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
