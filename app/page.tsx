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

function Card({ label, value, color = "text-slate-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <h2 className={`mt-3 text-3xl font-bold ${color}`}>{value}</h2>
    </div>
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

  useEffect(() => {
    const savedTransactions = localStorage.getItem(STORAGE_KEYS.transactions);
    const savedInstallments = localStorage.getItem(STORAGE_KEYS.installments);
    const savedSalaries = localStorage.getItem(STORAGE_KEYS.salaries);
    const savedFixedBills = localStorage.getItem(STORAGE_KEYS.fixedBills);
    const savedFixedBillsOverrides = localStorage.getItem(STORAGE_KEYS.fixedBillsOverrides);

    if (savedTransactions) {
      try {
        setTransactions(JSON.parse(savedTransactions));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.transactions);
      }
    }
    if (savedInstallments) {
      try {
        setInstallments(JSON.parse(savedInstallments));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.installments);
      }
    }
    if (savedSalaries) {
      try {
        setSalaryByMonth(JSON.parse(savedSalaries));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.salaries);
      }
    }
    if (savedFixedBills) {
      try {
        setFixedBills(JSON.parse(savedFixedBills));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.fixedBills);
      }
    }
    if (savedFixedBillsOverrides) {
      try {
        setFixedBillOverrides(JSON.parse(savedFixedBillsOverrides));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.fixedBillsOverrides);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.installments, JSON.stringify(installments));
  }, [installments]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.salaries, JSON.stringify(salaryByMonth));
  }, [salaryByMonth]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.fixedBills, JSON.stringify(fixedBills));
  }, [fixedBills]);
  useEffect(() => {
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

  function handleSubmitTransaction(e: React.FormEvent<HTMLFormElement>) {
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

    if (transactionMode === "edit" && editingTransactionId) {
      setTransactions((prev) =>
        prev
          .map((item) =>
            item.id === editingTransactionId
              ? {
                  ...item,
                  date,
                  description: description.trim(),
                  category,
                  amount: parsedAmount,
                  paymentMethod,
                  status,
                }
              : item
          )
          .sort((a, b) => b.date.localeCompare(a.date))
      );
    } else {
      const newTransaction: Transaction = {
        id: crypto.randomUUID(),
        date,
        description: description.trim(),
        category,
        amount: parsedAmount,
        paymentMethod,
        status,
      };
      setTransactions((prev) => [newTransaction, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    }

    closeTransactionModal();
  }

  function handleSubmitInstallment(e: React.FormEvent<HTMLFormElement>) {
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

    const payload: InstallmentPurchase = {
      id: editingInstallmentId || crypto.randomUUID(),
      description: installmentDescription.trim(),
      category: installmentCategory,
      totalAmount: parsedTotalAmount,
      totalInstallments: parsedInstallments,
      installmentAmount: parsedTotalAmount / parsedInstallments,
      startMonth: installmentStartMonth,
      notes: installmentNotes.trim(),
    };

    if (installmentMode === "edit" && editingInstallmentId) {
      setInstallments((prev) => prev.map((item) => (item.id === editingInstallmentId ? payload : item)));
    } else {
      setInstallments((prev) => [payload, ...prev]);
    }

    closeInstallmentModal();
  }

  function handleSubmitFixedBill(e: React.FormEvent<HTMLFormElement>) {
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
    const payload: FixedBill = {
      id: editingFixedBillId || crypto.randomUUID(),
      description: fixedBillDescription.trim(),
      category: fixedBillCategory,
      amount: parsedAmount,
      paymentMethod: fixedBillPaymentMethod,
      dayOfMonth: parsedDay,
      startMonth: fixedBillStartMonth,
      defaultStatus: fixedBillDefaultStatus,
      active: currentEditing?.active ?? true,
      notes: fixedBillNotes.trim(),
    };

    if (fixedBillMode === "edit" && editingFixedBillId) {
      setFixedBills((prev) => prev.map((item) => (item.id === editingFixedBillId ? payload : item)));
    } else {
      setFixedBills((prev) => [payload, ...prev]);
    }

    closeFixedBillModal();
  }

  function handleDeleteTransaction(id: string) {
    if (!window.confirm("Deseja excluir este lançamento?")) return;
    setTransactions((prev) => prev.filter((item) => item.id !== id));
  }

  function handleDeleteInstallment(id: string) {
    if (!window.confirm("Deseja excluir esta compra parcelada?")) return;
    setInstallments((prev) => prev.filter((item) => item.id !== id));
  }

  function handleDeleteFixedBill(id: string) {
    if (!window.confirm("Deseja excluir esta conta fixa?")) return;
    setFixedBills((prev) => prev.filter((item) => item.id !== id));
    setFixedBillOverrides((prev) => prev.filter((item) => item.fixedBillId !== id));
  }

  function handleToggleFixedBillActive(id: string) {
    setFixedBills((prev) =>
      prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    );
  }

  function saveSalary() {
    const parsedSalary = parseMoney(salaryInput);
    if (!salaryInput.trim()) {
      setSalaryByMonth((prev) => {
        const updated = { ...prev };
        delete updated[selectedMonth];
        return updated;
      });
      return;
    }
    if (!parsedSalary || parsedSalary <= 0) {
      alert("Informe um salário válido para este mês.");
      return;
    }
    setSalaryByMonth((prev) => ({ ...prev, [selectedMonth]: parsedSalary }));
  }

  function setFixedBillMonthAction(fixedBillId: string, month: string, action: FixedBillAction) {
    setFixedBillOverrides((prev) => {
      const existing = prev.find((item) => item.fixedBillId === fixedBillId && item.month === month);
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...item, action } : item));
      }
      return [...prev, { id: crypto.randomUUID(), fixedBillId, month, action }];
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
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
              <button onClick={saveSalary} className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">Salvar salário</button>
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
          <Card label="Salário" value={formatCurrency(currentSalary)} color="text-sky-600" />
          <Card label="Gasto do mês" value={formatCurrency(totalMonth)} color="text-rose-500" />
          <Card label="Pago" value={formatCurrency(totalPaid)} color="text-emerald-600" />
          <Card label="Pendente" value={formatCurrency(totalPending)} color="text-amber-500" />
          <Card label="Parcelas do mês" value={formatCurrency(totalInstallmentsMonth)} color="text-violet-600" />
          <Card label="Fixas do mês" value={formatCurrency(totalFixedBillsMonth)} color="text-cyan-600" />
          <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
            <p className="text-sm text-slate-300">Quanto sobrou</p>
            <h2 className="mt-3 text-3xl font-bold">{formatCurrency(projectedBalance)}</h2>
            <p className="mt-2 text-xs text-slate-300">Saldo real: {formatCurrency(realBalance)}</p>
          </div>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <SectionHeader title="Lançamentos do mês" subtitle={`Gastos cadastrados manualmente em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Novo" onClick={openCreateTransaction} />
            {monthTransactions.length === 0 ? (
              <EmptyState text="Nenhum lançamento registrado neste mês" />
            ) : (
              <div className="space-y-3">
                {monthTransactions.map((item) => (
                  <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.date} • {item.category} • {item.paymentMethod}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.status === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.status === "pago" ? "Pago" : "Pendente"}</span>
                      <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.amount)}</p>
                      <button onClick={() => openEditTransaction(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                      <button onClick={() => handleDeleteTransaction(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <SectionHeader title="Parcelas do cartão" subtitle={`Compras parceladas que caem em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Novo" onClick={openCreateInstallment} />
            {monthInstallments.length === 0 ? (
              <EmptyState text="Nenhuma parcela ativa neste mês" />
            ) : (
              <div className="space-y-3">
                {monthInstallments.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.category} • início em {formatMonthLabel(item.startMonth)}</p>
                        <p className="mt-1 text-sm text-slate-500">Parcela {item.currentInstallment}/{item.totalInstallments}{item.notes ? ` • ${item.notes}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">{item.currentInstallment}/{item.totalInstallments}</span>
                        <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.installmentAmount)}</p>
                        <button onClick={() => openEditInstallment(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        <button onClick={() => handleDeleteInstallment(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <SectionHeader title="Contas fixas do mês" subtitle={`Contas recorrentes exibidas automaticamente em ${formatMonthLabel(selectedMonth)}`} buttonLabel="Nova" onClick={openCreateFixedBill} />
            {monthFixedBills.length === 0 ? (
              <EmptyState text="Nenhuma conta fixa ativa neste mês" />
            ) : (
              <div className="space-y-3">
                {monthFixedBills.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                          <p className="mt-1 text-sm text-slate-500">Dia {item.dayOfMonth} • {item.projectedDate} • {item.category} • {item.paymentMethod}</p>
                          <p className="mt-1 text-sm text-slate-500">Início em {formatMonthLabel(item.startMonth)}{item.notes ? ` • ${item.notes}` : ""}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.action === "pago" ? "bg-emerald-100 text-emerald-700" : item.action === "pendente" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>{item.action === "pago" ? "Pago" : item.action === "pendente" ? "Pendente" : "Ignorado"}</span>
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
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <SectionHeader title="Cadastros de contas fixas" subtitle="Gerencie o que continua aparecendo nos próximos meses" />
            {fixedBills.length === 0 ? (
              <EmptyState text="Nenhuma conta fixa cadastrada" />
            ) : (
              <div className="space-y-3">
                {fixedBills.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                          <p className="mt-1 text-sm text-slate-500">{formatCurrency(item.amount)} • dia {item.dayOfMonth} • {item.category}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.active ? "Ativa" : "Inativa"} • início em {formatMonthLabel(item.startMonth)}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-sm font-medium ${item.active ? "bg-cyan-100 text-cyan-700" : "bg-slate-200 text-slate-700"}`}>{item.active ? "Ativa" : "Inativa"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEditFixedBill(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
                        <button onClick={() => handleToggleFixedBillActive(item.id)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">{item.active ? "Desativar" : "Ativar"}</button>
                        <button onClick={() => handleDeleteFixedBill(item.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100">Excluir</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                <button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">{transactionMode === "edit" ? "Salvar alterações" : "Salvar gasto"}</button>
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
              <div className="flex items-end gap-3 md:col-span-2"><button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">{installmentMode === "edit" ? "Salvar alterações" : "Salvar parcelado"}</button><button type="button" onClick={resetInstallmentForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button></div>
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
              <div className="flex items-end gap-3 md:col-span-2"><button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">{fixedBillMode === "edit" ? "Salvar alterações" : "Salvar conta fixa"}</button><button type="button" onClick={resetFixedBillForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button></div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
