import { prisma, nowIso } from "../src/db/client.js";
import { seedDefinitions } from "../src/workflows/definitions.js";
import { seedCustomers } from "../src/data/customers.js";

// Seed workflow templates + mock CRM so reviewers can run the demo immediately.
async function main() {
  // Mock CRM customers (queried by the search_customer_profile tool).
  for (const c of seedCustomers) {
    await prisma.customer.upsert({ where: { id: c.id }, update: c, create: c });
    console.log(`seeded customer: ${c.id} (${c.name})`);
  }

  for (const def of seedDefinitions) {
    await prisma.workflowDefinition.upsert({
      where: { name: def.name },
      update: {
        description: def.description,
        steps: def.steps,
        allowedTools: def.allowedTools,
        approvalRequiredTools: def.approvalRequiredTools,
      },
      create: {
        name: def.name,
        description: def.description,
        triggerType: def.triggerType,
        steps: def.steps,
        allowedTools: def.allowedTools,
        approvalRequiredTools: def.approvalRequiredTools,
        createdAt: nowIso(),
      },
    });
    console.log(`seeded: ${def.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
