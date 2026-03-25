"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase"

type StatusType = "pago" | "pendente";
type FixedBillAction = StatusType | "ignorado";

type Transaction = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string;
  status: StatusType;
};

type InstallmentPurchase = {
  id: string;
  description: string;
  category: string;
  totalAmount: number;
  totalInstallments: number;
  installmentAmount: number;
  startMonth: string;
  notes?: string;
};

type FixedBill = {
  id: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string;
  dayOfMonth: number;
  startMonth: string;
  defaultStatus: StatusType;
  active: boolean;
  notes?: string;
};

type FixedBillMonthOverride = {
  id: string;
  fixedBillId: string;
  month: string;
  action: FixedBillAction;
};

type SalaryByMonth = Record<string, number>;

type ModalMode = "create" | "edit";

const STORAGE_KEYS = {
  transactions: "controle-financeiro-transactions",
  installments: "controle-financeiro-installments",
  salaries: "controle-financeiro-salaries",
  fixedBills: "controle-financeiro-fixed-bills",
  fixedBillsOverrides: "controle-financeiro-fixed-bills-overrides",
};

const TABLES = {
  transactions: "transactions",
  installments: "installments",
  salaries: "salaries_by_month",
  fixedBills: "fixed_bills",
  fixedBillOverrides: "fixed_bill_month_statuses",
} as const;

const categorias = [
  "Casa",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Contas",
  "Cartão",
  "Assinaturas",
  "Outros",
];

const formasPagamento = [
  "Pix",
  "Dinheiro",
  "Cartão de débito",
  "Cartão de crédito",
  "Boleto",
  "Débito automático",
];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, (monthNumber || 1) - 1, 1);
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function getMonthOptionsFromCurrent(totalMonths = 24) {
  const current = getCurrentMonth();
  const [year, month] = current.split("-").map(Number);
  const base = new Date(year, (month || 1) - 1, 1);

  const options: string[] = [];
  for (let i = 0; i < totalMonths; i += 1) {
    const date = new Date(base.getFullYear(), base.getMonth() + i, 1);
    options.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return options;
}

function getMonthsDiff(startMonth: string, targetMonth: string) {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [targetYear, targetMonthNumber] = targetMonth.split("-").map(Number);
  return (targetYear - startYear) * 12 + (targetMonthNumber - startMonthNumber);
}

function isMonthBeforeCurrent(month: string) {
  return month < getCurrentMonth();
}

function getDateForSelectedMonth(selectedMonth: string, day: number) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const safeDay = Math.min(Math.max(day, 1), 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function parseMoney(input: string) {
  return Number(input.replace(",", "."));
}

function getCommittedPercent(total: number, salary: number) {
  if (!salary || salary <= 0) return 0;
  return (total / salary) * 100;
}

function CollapsibleCard({
  label,
  value,
  color = "text-slate-900",
  defaultOpen = false,
}: {
  label: string;
  value: string;
  color?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 transition group-open:bg-slate-900 group-open:text-white">
          {defaultOpen ? "aberto" : "ver"}
        </span>
      </summary>
      <h2 className={`mt-3 text-2xl font-bold md:text-3xl ${color}`}>{value}</h2>
    </details>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  buttonLabel,
  onClick,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  buttonLabel?: string;
  onClick?: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 select-none">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {buttonLabel && onClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }}
              className="hidden rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 md:block"
            >
              {buttonLabel}
            </button>
          ) : null}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 transition group-open:bg-slate-900 group-open:text-white">
            abrir
          </span>
        </div>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
      <p className="font-medium text-slate-700">{text}</p>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  buttonLabel,
  onClick,
}: {
  title: string;
  subtitle: string;
  buttonLabel?: string;
  onClick?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {buttonLabel && onClick ? (
        <button
          onClick={onClick}
          className="hidden rounded-2xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 md:block"
        >
          {buttonLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function Home() {
  const currentMonth = getCurrentMonth();
  const monthOptions = useMemo(() => getMonthOptionsFromCurrent(24), []);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<InstallmentPurchase[]>([]);
  const [fixedBills, setFixedBills] = useState<FixedBill[]>([]);
  const [fixedBillOverrides, setFixedBillOverrides] = useState<FixedBillMonthOverride[]>([]);
  const [salaryByMonth, setSalaryByMonth] = useState<SalaryByMonth>({});

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionMode, setTransactionMode] = useState<ModalMode>("create");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [installmentMode, setInstallmentMode] = useState<ModalMode>("create");
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);

  const [showFixedBillForm, setShowFixedBillForm] = useState(false);
  const [fixedBillMode, setFixedBillMode] = useState<ModalMode>("create");
  const [editingFixedBillId, setEditingFixedBillId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Outros");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [status, setStatus] = useState<StatusType>("pago");

  const [salaryInput, setSalaryInput] = useState("");

  const [installmentDescription, setInstallmentDescription] = useState("");
  const [installmentCategory, setInstallmentCategory] = useState("Cartão");
  const [installmentTotalAmount, setInstallmentTotalAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("");
  const [installmentStartMonth, setInstallmentStartMonth] = useState(currentMonth);
  const [installmentNotes, setInstallmentNotes] = useState("");

  const [fixedBillDescription, setFixedBillDescription] = useState("");
  const [fixedBillCategory, setFixedBillCategory] = useState("Contas");
  const [fixedBillAmount, setFixedBillAmount] = useState("");
  const [fixedBillPaymentMethod, setFixedBillPaymentMethod] = useState("Pix");
  const [fixedBillDay, setFixedBillDay] = useState("10");
  const [fixedBillStartMonth, setFixedBillStartMonth] = useState(currentMonth);
  const [fixedBillDefaultStatus, setFixedBillDefaultStatus] = useState<StatusType>("pendente");
  const [fixedBillNotes, setFixedBillNotes] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);


  useEffect(() => {
    setSelectedMonth(getCurrentMonth());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoadingData(true);

      const [transactionsResponse, installmentsResponse, salariesResponse, fixedBillsResponse, overridesResponse] = await Promise.all([
        supabase.from(TABLES.transactions).select("*"),
        supabase.from(TABLES.installments).select("*"),
        supabase.from(TABLES.salaries).select("month, amount"),
        supabase.from(TABLES.fixedBills).select("*"),
        supabase.from(TABLES.fixedBillOverrides).select("*"),
      ]);

      const responses = [transactionsResponse, installmentsResponse, salariesResponse, fixedBillsResponse, overridesResponse];
      const firstError = responses.find((response) => response.error)?.error;

      if (firstError) {
        console.error("Erro ao carregar dados do Supabase:", firstError);
        alert("Não foi possível carregar os dados do Supabase. Confira se as tabelas e policies foram criadas.");
        if (!cancelled) setIsLoadingData(false);
        return;
      }

      const transactionsData = (transactionsResponse.data ?? []).map((item) => ({
        id: item.id,
        date: item.date,
        description: item.description,
        category: item.category,
        amount: Number(item.amount),
        paymentMethod: item.payment_method,
        status: item.status as StatusType,
      }));

      const installmentsData = (installmentsResponse.data ?? []).map((item) => ({
        id: item.id,
        description: item.description,
        category: item.category,
        totalAmount: Number(item.total_amount),
        totalInstallments: Number(item.total_installments),
        installmentAmount: Number(item.installment_amount),
        startMonth: item.start_month,
        notes: item.notes ?? "",
      }));

      const fixedBillsData = (fixedBillsResponse.data ?? []).map((item) => ({
        id: item.id,
        description: item.description,
        category: item.category,
        amount: Number(item.amount),
        paymentMethod: item.payment_method,
        dayOfMonth: Number(item.day_of_month),
        startMonth: item.start_month,
        defaultStatus: item.default_status as StatusType,
        active: Boolean(item.active),
        notes: item.notes ?? "",
      }));

      const overridesData = (overridesResponse.data ?? []).map((item) => ({
        id: item.id,
        fixedBillId: item.fixed_bill_id,
        month: item.month,
        action: (item.action ?? item.status) as FixedBillAction,
      }));

      const salariesData = (salariesResponse.data ?? []).reduce<SalaryByMonth>((acc, item) => {
        acc[item.month] = Number(item.amount);
        return acc;
      }, {});

      const hasRemoteData =
        transactionsData.length > 0 ||
        installmentsData.length > 0 ||
        fixedBillsData.length > 0 ||
        overridesData.length > 0 ||
        Object.keys(salariesData).length > 0;

      if (!hasRemoteData && typeof window !== "undefined") {
        const savedTransactions = localStorage.getItem(STORAGE_KEYS.transactions);
        const savedInstallments = localStorage.getItem(STORAGE_KEYS.installments);
        const savedSalaries = localStorage.getItem(STORAGE_KEYS.salaries);
        const savedFixedBills = localStorage.getItem(STORAGE_KEYS.fixedBills);
        const savedFixedBillsOverrides = localStorage.getItem(STORAGE_KEYS.fixedBillsOverrides);

        try {
          const localTransactions: Transaction[] = savedTransactions ? JSON.parse(savedTransactions) : [];
          const localInstallments: InstallmentPurchase[] = savedInstallments ? JSON.parse(savedInstallments) : [];
          const localSalaries: SalaryByMonth = savedSalaries ? JSON.parse(savedSalaries) : {};
          const localFixedBills: FixedBill[] = savedFixedBills ? JSON.parse(savedFixedBills) : [];
          const localOverrides: FixedBillMonthOverride[] = savedFixedBillsOverrides ? JSON.parse(savedFixedBillsOverrides) : [];

          const hasLocalData =
            localTransactions.length > 0 ||
            localInstallments.length > 0 ||
            localFixedBills.length > 0 ||
            localOverrides.length > 0 ||
            Object.keys(localSalaries).length > 0;

          if (hasLocalData) {
            const operations: Promise<unknown>[] = [];

            if (localTransactions.length) {
              operations.push(supabase.from(TABLES.transactions).upsert(localTransactions.map((item) => ({
                id: item.id,
                date: item.date,
                description: item.description,
                category: item.category,
                amount: item.amount,
                payment_method: item.paymentMethod,
                status: item.status,
              })), { onConflict: "id" }));
            }

            if (localInstallments.length) {
              operations.push(supabase.from(TABLES.installments).upsert(localInstallments.map((item) => ({
                id: item.id,
                description: item.description,
                category: item.category,
                total_amount: item.totalAmount,
                total_installments: item.totalInstallments,
                installment_amount: item.installmentAmount,
                start_month: item.startMonth,
                notes: item.notes || null,
              })), { onConflict: "id" }));
            }

            if (localFixedBills.length) {
              operations.push(supabase.from(TABLES.fixedBills).upsert(localFixedBills.map((item) => ({
                id: item.id,
                description: item.description,
                category: item.category,
                amount: item.amount,
                payment_method: item.paymentMethod,
                day_of_month: item.dayOfMonth,
                start_month: item.startMonth,
                default_status: item.defaultStatus,
                active: item.active,
                notes: item.notes || null,
              })), { onConflict: "id" }));
            }

            if (localOverrides.length) {
              operations.push(supabase.from(TABLES.fixedBillOverrides).upsert(localOverrides.map((item) => ({
                id: item.id,
                fixed_bill_id: item.fixedBillId,
                month: item.month,
                action: item.action,
              })), { onConflict: "fixed_bill_id,month" }));
            }

            const salaryEntries = Object.entries(localSalaries);
            if (salaryEntries.length) {
              operations.push(supabase.from(TABLES.salaries).upsert(salaryEntries.map(([month, amount]) => ({ month, amount })), { onConflict: "month" }));
            }

            const results = await Promise.all(operations);
            const migrationError = results.find((result) => result && typeof result === "object" && "error" in result && result.error) as { error?: unknown } | undefined;

            if (!migrationError) {
              if (!cancelled) {
                setTransactions(localTransactions);
                setInstallments(localInstallments);
                setSalaryByMonth(localSalaries);
                setFixedBills(localFixedBills);
                setFixedBillOverrides(localOverrides);
                setIsLoadingData(false);
              }
              return;
            }

            console.error("Erro ao migrar dados do localStorage para o Supabase:", migrationError.error);
            alert("Os dados locais foram encontrados, mas a migração para o Supabase falhou.");
          }
        } catch (error) {
          console.error("Erro ao ler dados locais:", error);
        }
      }

      if (!cancelled) {
        setTransactions(transactionsData);
        setInstallments(installmentsData);
        setSalaryByMonth(salariesData);
        setFixedBills(fixedBillsData);
        setFixedBillOverrides(overridesData);
        setIsLoadingData(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.installments, JSON.stringify(installments));
  }, [installments]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.salaries, JSON.stringify(salaryByMonth));
  }, [salaryByMonth]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.fixedBills, JSON.stringify(fixedBills));
  }, [fixedBills]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.fixedBillsOverrides, JSON.stringify(fixedBillOverrides));
  }, [fixedBillOverrides]);
  useEffect(() => {
    const salary = salaryByMonth[selectedMonth];
    setSalaryInput(salary ? String(salary) : "");
  }, [selectedMonth, salaryByMonth]);

  const currentSalary = salaryByMonth[selectedMonth] || 0;

  const monthTransactions = useMemo(() => {
    return transactions
      .filter((item) => item.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedMonth, transactions]);

  const monthInstallments = useMemo(() => {
    return installments
      .map((item) => {
        const diff = getMonthsDiff(item.startMonth, selectedMonth);
        if (diff < 0 || diff >= item.totalInstallments) return null;
        return { ...item, currentInstallment: diff + 1 };
      })
      .filter(
        (item): item is InstallmentPurchase & { currentInstallment: number } => Boolean(item)
      )
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [installments, selectedMonth]);

  const monthFixedBills = useMemo(() => {
    return fixedBills
      .filter((bill) => bill.active)
      .map((bill) => {
        const diff = getMonthsDiff(bill.startMonth, selectedMonth);
        if (diff < 0) return null;
        const override = fixedBillOverrides.find(
          (item) => item.fixedBillId === bill.id && item.month === selectedMonth
        );
        return {
          ...bill,
          action: override?.action ?? bill.defaultStatus,
          projectedDate: getDateForSelectedMonth(selectedMonth, bill.dayOfMonth),
        };
      })
      .filter(
        (bill): bill is FixedBill & { action: FixedBillAction; projectedDate: string } =>
          Boolean(bill)
      )
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description));
  }, [fixedBills, fixedBillOverrides, selectedMonth]);

  const totalTransactionsMonth = useMemo(
    () => monthTransactions.reduce((acc, item) => acc + item.amount, 0),
    [monthTransactions]
  );
  const totalInstallmentsMonth = useMemo(
    () => monthInstallments.reduce((acc, item) => acc + item.installmentAmount, 0),
    [monthInstallments]
  );
  const totalFixedBillsMonth = useMemo(
    () => monthFixedBills.filter((item) => item.action !== "ignorado").reduce((acc, item) => acc + item.amount, 0),
    [monthFixedBills]
  );

  const totalPaid = useMemo(() => {
    const paidTransactions = monthTransactions
      .filter((item) => item.status === "pago")
      .reduce((acc, item) => acc + item.amount, 0);
    const paidFixed = monthFixedBills
      .filter((item) => item.action === "pago")
      .reduce((acc, item) => acc + item.amount, 0);
    return paidTransactions + paidFixed;
  }, [monthTransactions, monthFixedBills]);

  const totalPending = useMemo(() => {
    const pendingTransactions = monthTransactions
      .filter((item) => item.status === "pendente")
      .reduce((acc, item) => acc + item.amount, 0);
    const pendingFixed = monthFixedBills
      .filter((item) => item.action === "pendente")
      .reduce((acc, item) => acc + item.amount, 0);
    return pendingTransactions + pendingFixed;
  }, [monthTransactions, monthFixedBills]);

  const totalMonth = totalTransactionsMonth + totalInstallmentsMonth + totalFixedBillsMonth;
  const realBalance = currentSalary - totalPaid;
  const projectedBalance = currentSalary - totalPaid - totalPending - totalInstallmentsMonth;
  const committedPercent = currentSalary > 0 ? (totalMonth / currentSalary) * 100 : 0;

  const nextMonthsForecast = useMemo(() => {
    return monthOptions.slice(0, 6).map((month) => {
      const salary = salaryByMonth[month] || 0;
      const plannedTransactions = transactions
        .filter((item) => item.date.startsWith(month))
        .reduce((acc, item) => acc + item.amount, 0);
      const plannedInstallments = installments.reduce((acc, item) => {
        const diff = getMonthsDiff(item.startMonth, month);
        if (diff < 0 || diff >= item.totalInstallments) return acc;
        return acc + item.installmentAmount;
      }, 0);
      const plannedFixedBills = fixedBills.reduce((acc, bill) => {
        if (!bill.active) return acc;
        const diff = getMonthsDiff(bill.startMonth, month);
        if (diff < 0) return acc;
        const override = fixedBillOverrides.find(
          (item) => item.fixedBillId === bill.id && item.month === month
        );
        const action = override?.action ?? bill.defaultStatus;
        if (action === "ignorado") return acc;
        return acc + bill.amount;
      }, 0);

      const total = plannedTransactions + plannedInstallments + plannedFixedBills;
      return {
        month,
        salary,
        transactions: plannedTransactions,
        installments: plannedInstallments,
        fixedBills: plannedFixedBills,
        total,
        balance: salary - total,
      };
    });
  }, [fixedBillOverrides, fixedBills, installments, monthOptions, salaryByMonth, transactions]);

  function resetTransactionForm() {
    setDate(`${selectedMonth}-01`);
    setDescription("");
    setCategory("Outros");
    setAmount("");
    setPaymentMethod("Pix");
    setStatus("pago");
    setEditingTransactionId(null);
    setTransactionMode("create");
  }

  function resetInstallmentForm() {
    setInstallmentDescription("");
    setInstallmentCategory("Cartão");
    setInstallmentTotalAmount("");
    setInstallmentCount("");
    setInstallmentStartMonth(selectedMonth);
    setInstallmentNotes("");
    setEditingInstallmentId(null);
    setInstallmentMode("create");
  }

  function resetFixedBillForm() {
    setFixedBillDescription("");
    setFixedBillCategory("Contas");
    setFixedBillAmount("");
    setFixedBillPaymentMethod("Pix");
    setFixedBillDay("10");
    setFixedBillStartMonth(selectedMonth);
    setFixedBillDefaultStatus("pendente");
    setFixedBillNotes("");
    setEditingFixedBillId(null);
    setFixedBillMode("create");
  }

  function openCreateTransaction() {
    resetTransactionForm();
    setShowTransactionForm(true);
  }

  function openEditTransaction(item: Transaction) {
    setTransactionMode("edit");
    setEditingTransactionId(item.id);
    setDate(item.date);
    setDescription(item.description);
    setCategory(item.category);
    setAmount(String(item.amount));
    setPaymentMethod(item.paymentMethod);
    setStatus(item.status);
    setShowTransactionForm(true);
  }

  function openCreateInstallment() {
    resetInstallmentForm();
    setShowInstallmentForm(true);
  }

  function openEditInstallment(item: InstallmentPurchase) {
    setInstallmentMode("edit");
    setEditingInstallmentId(item.id);
    setInstallmentDescription(item.description);
    setInstallmentCategory(item.category);
    setInstallmentTotalAmount(String(item.totalAmount));
    setInstallmentCount(String(item.totalInstallments));
    setInstallmentStartMonth(item.startMonth);
    setInstallmentNotes(item.notes || "");
    setShowInstallmentForm(true);
  }

  function openCreateFixedBill() {
    resetFixedBillForm();
    setShowFixedBillForm(true);
  }

  function openEditFixedBill(item: FixedBill) {
    setFixedBillMode("edit");
    setEditingFixedBillId(item.id);
    setFixedBillDescription(item.description);
    setFixedBillCategory(item.category);
    setFixedBillAmount(String(item.amount));
    setFixedBillPaymentMethod(item.paymentMethod);
    setFixedBillDay(String(item.dayOfMonth));
    setFixedBillStartMonth(item.startMonth);
    setFixedBillDefaultStatus(item.defaultStatus);
    setFixedBillNotes(item.notes || "");
    setShowFixedBillForm(true);
  }

  function closeTransactionModal() {
    resetTransactionForm();
    setShowTransactionForm(false);
  }

  function closeInstallmentModal() {
    resetInstallmentForm();
    setShowInstallmentForm(false);
  }

  function closeFixedBillModal() {
    resetFixedBillForm();
    setShowFixedBillForm(false);
  }

  async function handleSubmitTransaction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedAmount = parseMoney(amount);

    if (!date || !description.trim() || !parsedAmount || parsedAmount <= 0) {
      alert("Preencha data, descrição e valor corretamente.");
      return;
    }
    if (date.slice(0, 7) < currentMonth) {
      alert("Só é permitido cadastrar lançamentos do mês atual para frente.");
      return;
    }

    setIsSaving(true);

    const payload = {
      id: editingTransactionId || crypto.randomUUID(),
      date,
      description: description.trim(),
      category,
      amount: parsedAmount,
      payment_method: paymentMethod,
      status,
    };

    const { error } = transactionMode === "edit" && editingTransactionId
      ? await supabase.from(TABLES.transactions).update(payload).eq("id", editingTransactionId)
      : await supabase.from(TABLES.transactions).insert(payload);

    setIsSaving(false);

    if (error) {
      console.error("Erro ao salvar lançamento:", error);
      alert("Não foi possível salvar o lançamento.");
      return;
    }

    const mappedPayload: Transaction = {
      id: payload.id,
      date: payload.date,
      description: payload.description,
      category: payload.category,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      status: payload.status as StatusType,
    };

    if (transactionMode === "edit" && editingTransactionId) {
      setTransactions((prev) => prev.map((item) => (item.id === editingTransactionId ? mappedPayload : item)).sort((a, b) => b.date.localeCompare(a.date)));
    } else {
      setTransactions((prev) => [mappedPayload, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    }

    closeTransactionModal();
  }


  async function handleSubmitInstallment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedTotalAmount = parseMoney(installmentTotalAmount);
    const parsedInstallments = Number(installmentCount);

    if (
      !installmentDescription.trim() ||
      !installmentStartMonth ||
      !parsedTotalAmount ||
      parsedTotalAmount <= 0 ||
      !parsedInstallments ||
      parsedInstallments <= 1
    ) {
      alert("Preencha descrição, valor total, mês inicial e quantidade de parcelas corretamente.");
      return;
    }
    if (isMonthBeforeCurrent(installmentStartMonth)) {
      alert("O parcelado deve começar no mês atual ou em um mês futuro.");
      return;
    }

    setIsSaving(true);

    const payload = {
      id: editingInstallmentId || crypto.randomUUID(),
      description: installmentDescription.trim(),
      category: installmentCategory,
      total_amount: parsedTotalAmount,
      total_installments: parsedInstallments,
      installment_amount: parsedTotalAmount / parsedInstallments,
      start_month: installmentStartMonth,
      notes: installmentNotes.trim() || null,
    };

    const { error } = installmentMode === "edit" && editingInstallmentId
      ? await supabase.from(TABLES.installments).update(payload).eq("id", editingInstallmentId)
      : await supabase.from(TABLES.installments).insert(payload);

    setIsSaving(false);

    if (error) {
      console.error("Erro ao salvar parcelado:", error);
      alert("Não foi possível salvar o parcelado.");
      return;
    }

    const mappedPayload: InstallmentPurchase = {
      id: payload.id,
      description: payload.description,
      category: payload.category,
      totalAmount: payload.total_amount,
      totalInstallments: payload.total_installments,
      installmentAmount: payload.installment_amount,
      startMonth: payload.start_month,
      notes: payload.notes || "",
    };

    if (installmentMode === "edit" && editingInstallmentId) {
      setInstallments((prev) => prev.map((item) => (item.id === editingInstallmentId ? mappedPayload : item)));
    } else {
      setInstallments((prev) => [mappedPayload, ...prev]);
    }

    closeInstallmentModal();
  }


  async function handleSubmitFixedBill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedAmount = parseMoney(fixedBillAmount);
    const parsedDay = Number(fixedBillDay);

    if (
      !fixedBillDescription.trim() ||
      !parsedAmount ||
      parsedAmount <= 0 ||
      !parsedDay ||
      parsedDay < 1 ||
      parsedDay > 31 ||
      !fixedBillStartMonth
    ) {
      alert("Preencha descrição, valor, dia do mês e mês inicial corretamente.");
      return;
    }
    if (isMonthBeforeCurrent(fixedBillStartMonth)) {
      alert("A conta fixa deve começar no mês atual ou em um mês futuro.");
      return;
    }

    const currentEditing = fixedBills.find((item) => item.id === editingFixedBillId);

    setIsSaving(true);

    const payload = {
      id: editingFixedBillId || crypto.randomUUID(),
      description: fixedBillDescription.trim(),
      category: fixedBillCategory,
      amount: parsedAmount,
      payment_method: fixedBillPaymentMethod,
      day_of_month: parsedDay,
      start_month: fixedBillStartMonth,
      default_status: fixedBillDefaultStatus,
      active: currentEditing?.active ?? true,
      notes: fixedBillNotes.trim() || null,
    };

    const { error } = fixedBillMode === "edit" && editingFixedBillId
      ? await supabase.from(TABLES.fixedBills).update(payload).eq("id", editingFixedBillId)
      : await supabase.from(TABLES.fixedBills).insert(payload);

    setIsSaving(false);

    if (error) {
      console.error("Erro ao salvar conta fixa:", error);
      alert("Não foi possível salvar a conta fixa.");
      return;
    }

    const mappedPayload: FixedBill = {
      id: payload.id,
      description: payload.description,
      category: payload.category,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      dayOfMonth: payload.day_of_month,
      startMonth: payload.start_month,
      defaultStatus: payload.default_status as StatusType,
      active: payload.active,
      notes: payload.notes || "",
    };

    if (fixedBillMode === "edit" && editingFixedBillId) {
      setFixedBills((prev) => prev.map((item) => (item.id === editingFixedBillId ? mappedPayload : item)));
    } else {
      setFixedBills((prev) => [mappedPayload, ...prev]);
    }

    closeFixedBillModal();
  }


  async function handleDeleteTransaction(id: string) {
    if (!window.confirm("Deseja excluir este lançamento?")) return;

    const { error } = await supabase.from(TABLES.transactions).delete().eq("id", id);
    if (error) {
      console.error("Erro ao excluir lançamento:", error);
      alert("Não foi possível excluir o lançamento.");
      return;
    }

    setTransactions((prev) => prev.filter((item) => item.id !== id));
  }


  async function handleDeleteInstallment(id: string) {
    if (!window.confirm("Deseja excluir esta compra parcelada?")) return;

    const { error } = await supabase.from(TABLES.installments).delete().eq("id", id);
    if (error) {
      console.error("Erro ao excluir parcelado:", error);
      alert("Não foi possível excluir o parcelado.");
      return;
    }

    setInstallments((prev) => prev.filter((item) => item.id !== id));
  }


  async function handleDeleteFixedBill(id: string) {
    if (!window.confirm("Deseja excluir esta conta fixa?")) return;

    const { error } = await supabase.from(TABLES.fixedBills).delete().eq("id", id);
    if (error) {
      console.error("Erro ao excluir conta fixa:", error);
      alert("Não foi possível excluir a conta fixa.");
      return;
    }

    setFixedBills((prev) => prev.filter((item) => item.id !== id));
    setFixedBillOverrides((prev) => prev.filter((item) => item.fixedBillId !== id));
  }


  async function handleToggleFixedBillActive(id: string) {
    const currentBill = fixedBills.find((item) => item.id === id);
    if (!currentBill) return;

    const nextActive = !currentBill.active;
    const { error } = await supabase.from(TABLES.fixedBills).update({ active: nextActive }).eq("id", id);
    if (error) {
      console.error("Erro ao alterar status da conta fixa:", error);
      alert("Não foi possível atualizar a conta fixa.");
      return;
    }

    setFixedBills((prev) => prev.map((item) => (item.id === id ? { ...item, active: nextActive } : item)));
  }


  async function saveSalary() {
    if (!salaryInput.trim()) {
      const { error } = await supabase.from(TABLES.salaries).delete().eq("month", selectedMonth);
      if (error) {
        console.error("Erro ao remover salário:", error);
        alert("Não foi possível remover o salário deste mês.");
        return;
      }
      setSalaryByMonth((prev) => {
        const updated = { ...prev };
        delete updated[selectedMonth];
        return updated;
      });
      return;
    }

    const parsedSalary = parseMoney(salaryInput);
    if (!parsedSalary || parsedSalary <= 0) {
      alert("Informe um salário válido para este mês.");
      return;
    }

    const { error } = await supabase.from(TABLES.salaries).upsert({ month: selectedMonth, amount: parsedSalary }, { onConflict: "month" });
    if (error) {
      console.error("Erro ao salvar salário:", error);
      alert("Não foi possível salvar o salário.");
      return;
    }

    setSalaryByMonth((prev) => ({ ...prev, [selectedMonth]: parsedSalary }));
  }


  async function setFixedBillMonthAction(fixedBillId: string, month: string, action: FixedBillAction) {
    const existing = fixedBillOverrides.find((item) => item.fixedBillId === fixedBillId && item.month === month);
    const payload = {
      id: existing?.id || crypto.randomUUID(),
      fixed_bill_id: fixedBillId,
      month,
      action,
    };

    const { error } = await supabase.from(TABLES.fixedBillOverrides).upsert(payload, { onConflict: "fixed_bill_id,month" });
    if (error) {
      console.error("Erro ao atualizar status mensal da conta fixa:", error);
      alert("Não foi possível atualizar o status mensal da conta fixa.");
      return;
    }

    setFixedBillOverrides((prev) => {
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...item, action } : item));
      }
      return [...prev, { id: payload.id, fixedBillId, month, action }];
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {isLoadingData ? (
        <div className="sticky top-0 z-40 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700 ring-1 ring-amber-200">
          Carregando dados do Supabase...
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <section className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-slate-300">Seu painel financeiro</p>
              <h1 className="mt-1 text-3xl font-bold md:text-4xl">Controle Financeiro</h1>
              <p className="mt-2 text-sm text-slate-300">
                Organize salário, gastos, parcelados e contas fixas do mês.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(180px,220px)_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Mês de referência</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none backdrop-blur"
                >
                  {monthOptions.map((item) => (
                    <option key={item} value={item} className="text-slate-900">
                      {formatMonthLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-3 sm:justify-end">
                <button onClick={openCreateTransaction} className="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-900 transition hover:scale-[1.02]">+ Gasto</button>
                <button onClick={openCreateInstallment} className="rounded-2xl bg-white/10 px-5 py-3 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15">+ Parcelado</button>
                <button onClick={openCreateFixedBill} className="rounded-2xl bg-white/10 px-5 py-3 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15">+ Conta fixa</button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-slate-500">Salário do mês selecionado</p>
              <h2 className="mt-1 text-2xl font-bold capitalize text-slate-900">{formatMonthLabel(selectedMonth)}</h2>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
              <input type="number" step="0.01" placeholder="Informe o salário do mês" value={salaryInput} onChange={(e) => setSalaryInput(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" />
              <button onClick={saveSalary} className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoadingData}>{isSaving ? "Salvando..." : "Salvar salário"}</button>
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <CollapsibleCard label="Salário" value={formatCurrency(currentSalary)} color="text-sky-600" />
          <CollapsibleCard label="Gasto do mês" value={formatCurrency(totalMonth)} color="text-rose-500" />
          <CollapsibleCard label="Parcelas do mês" value={formatCurrency(totalInstallmentsMonth)} color="text-violet-600" />
          <CollapsibleCard label="Fixas do mês" value={formatCurrency(totalFixedBillsMonth)} color="text-cyan-600" />
          <details className="group rounded-3xl bg-slate-900 p-4 text-white shadow-sm ring-1 ring-slate-800">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none">
              <p className="text-sm font-medium text-slate-200">Quanto sobrou</p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition group-open:bg-white group-open:text-slate-900">
                ver
              </span>
            </summary>
            <h2 className="mt-3 text-2xl font-bold md:text-3xl">{formatCurrency(projectedBalance)}</h2>
            <p className="mt-2 text-xs text-slate-300">Saldo real: {formatCurrency(realBalance)}</p>
          </details>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <details className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" open>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 select-none">
              <div>
                <p className="text-sm font-medium text-slate-500">Resumo automático do mês</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Visão rápida de {formatMonthLabel(selectedMonth)}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition group-open:bg-slate-900 group-open:text-white">ver</span>
            </summary>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Disponível hoje</p>
                <p className={`mt-2 text-2xl font-bold ${realBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatCurrency(realBalance)}</p>
                <p className="mt-1 text-xs text-slate-500">Salário menos tudo que já está pago.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fechamento previsto</p>
                <p className={`mt-2 text-2xl font-bold ${projectedBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatCurrency(projectedBalance)}</p>
                <p className="mt-1 text-xs text-slate-500">Considera pendências, parcelas e fixas do mês.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Salário comprometido</p>
                <p className={`mt-2 text-2xl font-bold ${committedPercent < 80 ? "text-slate-900" : committedPercent < 100 ? "text-amber-600" : "text-rose-600"}`}>{committedPercent.toFixed(0)}%</p>
                <p className="mt-1 text-xs text-slate-500">Tudo que o mês já tem previsto sobre o salário.</p>
              </div>
            </div>
          </details>

          <details className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" open>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 select-none">
              <div>
                <p className="text-sm font-medium text-slate-500">Previsão dos próximos meses</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Visão futura</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition group-open:bg-slate-900 group-open:text-white">6 meses</span>
            </summary>

            <div className="mt-4 space-y-3">
              {nextMonthsForecast.map((item) => (
                <details key={item.month} className="group/item rounded-2xl border border-slate-200 p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold capitalize text-slate-900">{formatMonthLabel(item.month)}</p>
                      <p className="text-xs text-slate-500">Toque para ver os valores</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.balance >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {item.balance >= 0 ? "Sobra" : "Falta"} {formatCurrency(Math.abs(item.balance))}
                    </span>
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Salário<br /><span className="font-semibold text-slate-900">{formatCurrency(item.salary)}</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Gastos<br /><span className="font-semibold text-slate-900">{formatCurrency(item.transactions)}</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Parcelas<br /><span className="font-semibold text-slate-900">{formatCurrency(item.installments)}</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Fixas<br /><span className="font-semibold text-slate-900">{formatCurrency(item.fixedBills)}</span></div>
                  </div>
                  <div className="mt-2 rounded-xl bg-slate-900/5 px-3 py-2 text-xs text-slate-600">Total previsto: <span className="font-semibold text-slate-900">{formatCurrency(item.total)}</span></div>
                </details>
              ))}
            </div>
          </details>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <CollapsibleSection title="Lançamentos do mês" subtitle={`Gastos cadastrados manualmente em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Novo" onClick={openCreateTransaction}>
            {monthTransactions.length === 0 ? (
              <EmptyState text="Nenhum lançamento registrado neste mês" />
            ) : (
              <div className="space-y-3">
                {monthTransactions.map((item) => (
                  <details key={item.id} className="group rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.date} • {item.category}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.status === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.status === "pago" ? "Pago" : "Pendente"}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">ver valores</span>
                      </div>
                    </summary>
                    <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm text-slate-500">{item.paymentMethod}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.amount)}</p>
                        <button onClick={() => openEditTransaction(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        <button onClick={() => handleDeleteTransaction(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Parcelas do cartão" subtitle={`Compras parceladas que caem em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Novo" onClick={openCreateInstallment}>
            {monthInstallments.length === 0 ? (
              <EmptyState text="Nenhuma parcela ativa neste mês" />
            ) : (
              <div className="space-y-3">
                {monthInstallments.map((item) => (
                  <details key={item.id} className="group rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">Parcela {item.currentInstallment}/{item.totalInstallments}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">{item.currentInstallment}/{item.totalInstallments}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">ver valores</span>
                      </div>
                    </summary>
                    <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm text-slate-500">{item.category} • início em {formatMonthLabel(item.startMonth)}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.notes || "Sem observações"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.installmentAmount)}</p>
                        <button onClick={() => openEditInstallment(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        <button onClick={() => handleDeleteInstallment(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </section>
        <section className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <CollapsibleSection title="Contas fixas do mês" subtitle={`Contas recorrentes exibidas automaticamente em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Nova" onClick={openCreateFixedBill}>
            {monthFixedBills.length === 0 ? (
              <EmptyState text="Nenhuma conta fixa ativa neste mês" />
            ) : (
              <div className="space-y-3">
                {monthFixedBills.map((item) => (
                  <details key={item.id} className="group rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">Dia {item.dayOfMonth} • {item.category}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.action === "pago" ? "bg-emerald-100 text-emerald-700" : item.action === "pendente" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>{item.action === "pago" ? "Pago" : item.action === "pendente" ? "Pendente" : "Ignorado"}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">ver valores</span>
                      </div>
                    </summary>
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm text-slate-500">{item.projectedDate} • {item.paymentMethod}</p>
                          <p className="mt-1 text-sm text-slate-500">Início em {formatMonthLabel(item.startMonth)}{item.notes ? ` • ${item.notes}` : ""}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.amount)}</p>
                          <button onClick={() => openEditFixedBill(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setFixedBillMonthAction(item.id, selectedMonth, "pago")} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100">Marcar pago</button>
                        <button onClick={() => setFixedBillMonthAction(item.id, selectedMonth, "pendente")} className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100">Deixar pendente</button>
                        <button onClick={() => setFixedBillMonthAction(item.id, selectedMonth, "ignorado")} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Ignorar mês</button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Cadastros de contas fixas" subtitle="Gerencie o que continua aparecendo nos próximos meses">
            {fixedBills.length === 0 ? (
              <EmptyState text="Nenhuma conta fixa cadastrada" />
            ) : (
              <div className="space-y-3">
                {fixedBills.map((item) => (
                  <details key={item.id} className="group rounded-2xl border border-slate-200 p-4">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">dia {item.dayOfMonth} • {item.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.active ? "bg-cyan-100 text-cyan-700" : "bg-slate-200 text-slate-700"}`}>{item.active ? "Ativa" : "Inativa"}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">ver valores</span>
                      </div>
                    </summary>
                    <div className="mt-4 flex flex-col gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{formatCurrency(item.amount)} • início em {formatMonthLabel(item.startMonth)}</p>
                        {item.notes ? <p className="mt-1 text-sm text-slate-500">{item.notes}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEditFixedBill(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        <button onClick={() => handleToggleFixedBillActive(item.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">{item.active ? "Desativar" : "Ativar"}</button>
                        <button onClick={() => handleDeleteFixedBill(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </section>
      </div>

      {showTransactionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{transactionMode === "edit" ? "Editar lançamento" : "Novo lançamento"}</h2>
                <p className="text-sm text-slate-500">Preencha os dados do gasto do mês</p>
              </div>
              <button onClick={closeTransactionModal} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Fechar</button>
            </div>
            <form onSubmit={handleSubmitTransaction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Data</label>
                <input type="date" min={`${currentMonth}-01`} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Valor</label>
                <input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
                <input type="text" placeholder="Ex: Mercado, gasolina, internet..." value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900">{categorias.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Forma de pagamento</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900">{formasPagamento.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusType)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"><option value="pago">Pago</option><option value="pendente">Pendente</option></select>
              </div>
              <div className="flex items-end gap-3 md:col-span-2">
                <button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoadingData}>{isSaving ? "Salvando..." : transactionMode === "edit" ? "Salvar alterações" : "Salvar gasto"}</button>
                <button type="button" onClick={resetTransactionForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInstallmentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{installmentMode === "edit" ? "Editar compra parcelada" : "Nova compra parcelada"}</h2>
                <p className="text-sm text-slate-500">Cadastre uma vez e o sistema distribui as parcelas pelos meses.</p>
              </div>
              <button onClick={closeInstallmentModal} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Fechar</button>
            </div>
            <form onSubmit={handleSubmitInstallment} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label><input type="text" placeholder="Ex: Celular, geladeira, seguro..." value={installmentDescription} onChange={(e) => setInstallmentDescription(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Valor total</label><input type="number" step="0.01" placeholder="0,00" value={installmentTotalAmount} onChange={(e) => setInstallmentTotalAmount(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Quantidade de parcelas</label><input type="number" min="2" placeholder="Ex: 10" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Mês da primeira parcela</label><input type="month" min={currentMonth} value={installmentStartMonth} onChange={(e) => setInstallmentStartMonth(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label><select value={installmentCategory} onChange={(e) => setInstallmentCategory(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900">{categorias.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Observação</label><input type="text" placeholder="Opcional" value={installmentNotes} onChange={(e) => setInstallmentNotes(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div className="flex items-end gap-3 md:col-span-2"><button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoadingData}>{isSaving ? "Salvando..." : installmentMode === "edit" ? "Salvar alterações" : "Salvar parcelado"}</button><button type="button" onClick={resetInstallmentForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button></div>
            </form>
          </div>
        </div>
      )}

      {showFixedBillForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{fixedBillMode === "edit" ? "Editar conta fixa" : "Nova conta fixa"}</h2>
                <p className="text-sm text-slate-500">Ela será exibida automaticamente em todo mês futuro.</p>
              </div>
              <button onClick={closeFixedBillModal} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Fechar</button>
            </div>
            <form onSubmit={handleSubmitFixedBill} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label><input type="text" placeholder="Ex: Aluguel, internet, academia..." value={fixedBillDescription} onChange={(e) => setFixedBillDescription(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Valor</label><input type="number" step="0.01" placeholder="0,00" value={fixedBillAmount} onChange={(e) => setFixedBillAmount(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Dia do mês</label><input type="number" min="1" max="31" value={fixedBillDay} onChange={(e) => setFixedBillDay(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Mês de início</label><input type="month" min={currentMonth} value={fixedBillStartMonth} onChange={(e) => setFixedBillStartMonth(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label><select value={fixedBillCategory} onChange={(e) => setFixedBillCategory(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900">{categorias.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Forma de pagamento</label><select value={fixedBillPaymentMethod} onChange={(e) => setFixedBillPaymentMethod(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900">{formasPagamento.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Status padrão</label><select value={fixedBillDefaultStatus} onChange={(e) => setFixedBillDefaultStatus(e.target.value as StatusType)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"><option value="pago">Pago</option><option value="pendente">Pendente</option></select></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Observação</label><input type="text" placeholder="Opcional" value={fixedBillNotes} onChange={(e) => setFixedBillNotes(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div className="flex items-end gap-3 md:col-span-2"><button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoadingData}>{isSaving ? "Salvando..." : fixedBillMode === "edit" ? "Salvar alterações" : "Salvar conta fixa"}</button><button type="button" onClick={resetFixedBillForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button></div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
