// Mock CRM records seeded into the Customer table. Varied plans / risk / payment
// status so different customerIds produce genuinely different agent behavior.

export interface SeedCustomer {
  id: string;
  name: string;
  email: string;
  company: string;
  plan: "free" | "pro" | "enterprise";
  region: string;
  phone: string;
  tenureMonths: number;
  signupDate: string;
  openTickets: number;
  lifetimeValueUsd: number;
  accountStatus: "active" | "at_risk" | "churned";
  paymentStatus: "current" | "overdue";
  satisfactionScore: number;
  lastContactAt: string;
  notes: string;
}

export const seedCustomers: SeedCustomer[] = [
  {
    id: "cust_1024",
    name: "Jordan Avery",
    email: "jordan@example.com",
    company: "Brightwave Studios",
    plan: "pro",
    region: "US-East",
    phone: "+1-202-555-0148",
    tenureMonths: 14,
    signupDate: "2025-04-12",
    openTickets: 1,
    lifetimeValueUsd: 4200,
    accountStatus: "active",
    paymentStatus: "current",
    satisfactionScore: 82,
    lastContactAt: "2026-06-02",
    notes: "Reliable Pro customer. Previously upgraded from Free after 2 months.",
  },
  {
    id: "cust_2048",
    name: "Priya Nair",
    email: "priya@acme.io",
    company: "Acme Robotics",
    plan: "enterprise",
    region: "EU-West",
    phone: "+44-20-7946-0991",
    tenureMonths: 38,
    signupDate: "2023-03-01",
    openTickets: 3,
    lifetimeValueUsd: 91000,
    accountStatus: "at_risk",
    paymentStatus: "overdue",
    satisfactionScore: 61,
    lastContactAt: "2026-06-18",
    notes: "Strategic enterprise account. Invoice overdue 22 days; renewal in 60 days.",
  },
  {
    id: "cust_3071",
    name: "Marcus Lee",
    email: "marcus.lee@freemail.com",
    company: "Solo / Individual",
    plan: "free",
    region: "APAC",
    phone: "+65-6555-0123",
    tenureMonths: 2,
    signupDate: "2026-04-20",
    openTickets: 0,
    lifetimeValueUsd: 0,
    accountStatus: "active",
    paymentStatus: "current",
    satisfactionScore: 74,
    lastContactAt: "2026-05-29",
    notes: "New free-tier user, evaluating before upgrading.",
  },
  {
    id: "cust_4096",
    name: "Sofia Romano",
    email: "sofia@northstar.co",
    company: "Northstar Logistics",
    plan: "pro",
    region: "EU-South",
    phone: "+39-06-555-0177",
    tenureMonths: 19,
    signupDate: "2024-11-05",
    openTickets: 5,
    lifetimeValueUsd: 6100,
    accountStatus: "at_risk",
    paymentStatus: "current",
    satisfactionScore: 48,
    lastContactAt: "2026-06-20",
    notes: "Repeated billing complaints this quarter. Sentiment trending negative.",
  },
  {
    id: "cust_5120",
    name: "David Okafor",
    email: "david@vertexpay.com",
    company: "VertexPay",
    plan: "enterprise",
    region: "US-West",
    phone: "+1-415-555-0190",
    tenureMonths: 52,
    signupDate: "2022-02-14",
    openTickets: 0,
    lifetimeValueUsd: 148000,
    accountStatus: "active",
    paymentStatus: "current",
    satisfactionScore: 93,
    lastContactAt: "2026-05-10",
    notes: "Top-tier advocate. Reference customer; very high lifetime value.",
  },
];
