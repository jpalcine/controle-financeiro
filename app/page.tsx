
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Transaction = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string;
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
  active: boolean;
  notes?: string;
};

type SalaryByMonth = Record<string, number>;
type ModalMode = "create" | "edit";

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
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
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

function parseMoney(input: string) {
  return Number(input.replace(",", "."));
}

function Card({
  label,
  value,
  color = "text-slate-900",
}: {
  label: string;
  value: string;
  color?: string;
}) {
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
  const [salaryByMonth, setSalaryByMonth] = useState<SalaryByMonth>({});

  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState("Conectando ao banco...");
  const [isSavingSalary, setIsSavingSalary] = useState(false);

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
  const [fixedBillNotes, setFixedBillNotes] = useState("");

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const salary = salaryByMonth[selectedMonth];
    setSalaryInput(salary ? String(salary) : "");
  }, [selectedMonth, salaryByMonth]);

  async function loadAllData() {
    setLoading(true);
    const [transactionsRes, installmentsRes, fixedBillsRes, salariesRes] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("installments").select("*").order("start_month", { ascending: false }),
      supabase.from("fixed_bills").select("*").order("description", { ascending: true }),
      supabase.from("monthly_salaries").select("*").order("month", { ascending: false }),
    ]);

    const errors = [
      transactionsRes.error,
      installmentsRes.error,
      fixedBillsRes.error,
      salariesRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Erro ao carregar do Supabase:", errors);
      setSyncMessage("Erro ao carregar dados do banco.");
      setLoading(false);
      return;
    }

    setTransactions(
      (transactionsRes.data || []).map((item: any) => ({
        id: item.id,
        date: item.date,
        description: item.description,
        category: item.category || "Outros",
        amount: Number(item.amount || 0),
        paymentMethod: item.payment_method || "Pix",
      }))
    );

    setInstallments(
      (installmentsRes.data || []).map((item: any) => ({
        id: item.id,
        description: item.description,
        category: item.category || "Cartão",
        totalAmount: Number(item.total_amount || 0),
        totalInstallments: Number(item.total_installments || 0),
        installmentAmount: Number(item.installment_amount || 0),
        startMonth: item.start_month,
        notes: item.notes || "",
      }))
    );

    setFixedBills(
      (fixedBillsRes.data || []).map((item: any) => ({
        id: item.id,
        description: item.description,
        category: item.category || "Contas",
        amount: Number(item.amount || 0),
        paymentMethod: item.payment_method || "Pix",
        dayOfMonth: Number(item.day_of_month || 1),
        startMonth: item.start_month,
        active: Boolean(item.active),
        notes: item.notes || "",
      }))
    );

    const salariesMap: SalaryByMonth = {};
    (salariesRes.data || []).forEach((item: any) => {
      salariesMap[item.month] = Number(item.amount || 0);
    });
    setSalaryByMonth(salariesMap);

    setSyncMessage("Banco online conectado.");
    setLoading(false);
  }

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
      .filter((bill) => getMonthsDiff(bill.startMonth, selectedMonth) >= 0)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description));
  }, [fixedBills, selectedMonth]);

  const totalTransactionsMonth = useMemo(
    () => monthTransactions.reduce((acc, item) => acc + item.amount, 0),
    [monthTransactions]
  );
  const totalInstallmentsMonth = useMemo(
    () => monthInstallments.reduce((acc, item) => acc + item.installmentAmount, 0),
    [monthInstallments]
  );
  const totalFixedBillsMonth = useMemo(
    () => monthFixedBills.reduce((acc, item) => acc + item.amount, 0),
    [monthFixedBills]
  );

  const totalMonth = totalTransactionsMonth + totalInstallmentsMonth + totalFixedBillsMonth;
  const projectedBalance = currentSalary - totalMonth;

  function resetTransactionForm() {
    setDate(`${selectedMonth}-01`);
    setDescription("");
    setCategory("Outros");
    setAmount("");
    setPaymentMethod("Pix");
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

    const payload = {
      date,
      description: description.trim(),
      category,
      amount: parsedAmount,
      payment_method: paymentMethod,
    };

    if (transactionMode === "edit" && editingTransactionId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editingTransactionId);
      if (error) {
        console.error(error);
        alert("Erro ao salvar lançamento.");
        return;
      }
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
                }
              : item
          )
          .sort((a, b) => b.date.localeCompare(a.date))
      );
    } else {
      const { data, error } = await supabase
        .from("transactions")
        .insert(payload)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        alert("Erro ao salvar lançamento.");
        return;
      }

      const newTransaction: Transaction = {
        id: data.id,
        date: data.date,
        description: data.description,
        category: data.category || "Outros",
        amount: Number(data.amount || 0),
        paymentMethod: data.payment_method || "Pix",
      };

      setTransactions((prev) => [newTransaction, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
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

    const payload = {
      description: installmentDescription.trim(),
      category: installmentCategory,
      total_amount: parsedTotalAmount,
      total_installments: parsedInstallments,
      installment_amount: parsedTotalAmount / parsedInstallments,
      start_month: installmentStartMonth,
      notes: installmentNotes.trim(),
    };

    if (installmentMode === "edit" && editingInstallmentId) {
      const { error } = await supabase.from("installments").update(payload).eq("id", editingInstallmentId);
      if (error) {
        console.error(error);
        alert("Erro ao salvar parcelado.");
        return;
      }

      const mapped: InstallmentPurchase = {
        id: editingInstallmentId,
        description: payload.description,
        category: payload.category,
        totalAmount: payload.total_amount,
        totalInstallments: payload.total_installments,
        installmentAmount: payload.installment_amount,
        startMonth: payload.start_month,
        notes: payload.notes,
      };

      setInstallments((prev) => prev.map((item) => (item.id === editingInstallmentId ? mapped : item)));
    } else {
      const { data, error } = await supabase.from("installments").insert(payload).select().single();
      if (error || !data) {
        console.error(error);
        alert("Erro ao salvar parcelado.");
        return;
      }

      const mapped: InstallmentPurchase = {
        id: data.id,
        description: data.description,
        category: data.category || "Cartão",
        totalAmount: Number(data.total_amount || 0),
        totalInstallments: Number(data.total_installments || 0),
        installmentAmount: Number(data.installment_amount || 0),
        startMonth: data.start_month,
        notes: data.notes || "",
      };

      setInstallments((prev) => [mapped, ...prev]);
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
    const payload = {
      description: fixedBillDescription.trim(),
      category: fixedBillCategory,
      amount: parsedAmount,
      payment_method: fixedBillPaymentMethod,
      day_of_month: parsedDay,
      start_month: fixedBillStartMonth,
      active: currentEditing?.active ?? true,
      notes: fixedBillNotes.trim(),
    };

    if (fixedBillMode === "edit" && editingFixedBillId) {
      const { error } = await supabase.from("fixed_bills").update(payload).eq("id", editingFixedBillId);
      if (error) {
        console.error(error);
        alert("Erro ao salvar conta fixa.");
        return;
      }

      const mapped: FixedBill = {
        id: editingFixedBillId,
        description: payload.description,
        category: payload.category,
        amount: payload.amount,
        paymentMethod: payload.payment_method,
        dayOfMonth: payload.day_of_month,
        startMonth: payload.start_month,
        active: Boolean(payload.active),
        notes: payload.notes,
      };

      setFixedBills((prev) => prev.map((item) => (item.id === editingFixedBillId ? mapped : item)));
    } else {
      const { data, error } = await supabase.from("fixed_bills").insert(payload).select().single();
      if (error || !data) {
        console.error(error);
        alert("Erro ao salvar conta fixa.");
        return;
      }

      const mapped: FixedBill = {
        id: data.id,
        description: data.description,
        category: data.category || "Contas",
        amount: Number(data.amount || 0),
        paymentMethod: data.payment_method || "Pix",
        dayOfMonth: Number(data.day_of_month || 1),
        startMonth: data.start_month,
        active: Boolean(data.active),
        notes: data.notes || "",
      };

      setFixedBills((prev) => [mapped, ...prev]);
    }

    closeFixedBillModal();
  }

  async function handleDeleteTransaction(id: string) {
    if (!window.confirm("Deseja excluir este lançamento?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("Erro ao excluir lançamento.");
      return;
    }
    setTransactions((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleDeleteInstallment(id: string) {
    if (!window.confirm("Deseja excluir esta compra parcelada?")) return;
    const { error } = await supabase.from("installments").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("Erro ao excluir parcelado.");
      return;
    }
    setInstallments((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleDeleteFixedBill(id: string) {
    if (!window.confirm("Deseja excluir esta conta fixa?")) return;
    const { error } = await supabase.from("fixed_bills").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("Erro ao excluir conta fixa.");
      return;
    }
    setFixedBills((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleToggleFixedBillActive(id: string) {
    const current = fixedBills.find((item) => item.id === id);
    if (!current) return;

    const nextActive = !current.active;
    const { error } = await supabase
      .from("fixed_bills")
      .update({ active: nextActive })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao alterar conta fixa.");
      return;
    }

    setFixedBills((prev) => prev.map((item) => (item.id === id ? { ...item, active: nextActive } : item)));
  }

  async function saveSalary() {
    const parsedSalary = parseMoney(salaryInput);

    if (salaryInput.trim() && (!parsedSalary || parsedSalary <= 0)) {
      alert("Informe um salário válido para este mês.");
      return;
    }

    setIsSavingSalary(true);

    if (!salaryInput.trim()) {
      const { error } = await supabase.from("monthly_salaries").delete().eq("month", selectedMonth);
      setIsSavingSalary(false);
      if (error) {
        console.error(error);
        alert("Erro ao remover salário.");
        return;
      }

      setSalaryByMonth((prev) => {
        const updated = { ...prev };
        delete updated[selectedMonth];
        return updated;
      });
      return;
    }

    const { error } = await supabase
      .from("monthly_salaries")
      .upsert({ month: selectedMonth, amount: parsedSalary }, { onConflict: "month" });

    setIsSavingSalary(false);

    if (error) {
      console.error(error);
      alert("Erro ao salvar salário.");
      return;
    }

    setSalaryByMonth((prev) => ({ ...prev, [selectedMonth]: parsedSalary }));
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
              <div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                {loading ? "Carregando do banco..." : syncMessage}
              </div>
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
              <input
                type="number"
                step="0.01"
                placeholder="Informe o salário do mês"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"
              />
              <button onClick={saveSalary} className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">
                {isSavingSalary ? "Salvando..." : "Salvar salário"}
              </button>
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card label="Salário" value={formatCurrency(currentSalary)} color="text-sky-600" />
          <Card label="Gastos manuais" value={formatCurrency(totalTransactionsMonth)} color="text-rose-500" />
          <Card label="Parcelas do mês" value={formatCurrency(totalInstallmentsMonth)} color="text-violet-600" />
          <Card label="Fixas do mês" value={formatCurrency(totalFixedBillsMonth)} color="text-cyan-600" />
          <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
            <p className="text-sm text-slate-300">Quanto sobrou</p>
            <h2 className="mt-3 text-3xl font-bold">{formatCurrency(projectedBalance)}</h2>
            <p className="mt-2 text-xs text-slate-300">Total do mês: {formatCurrency(totalMonth)}</p>
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
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-sm text-slate-500">Dia {item.dayOfMonth} • {item.category} • {item.paymentMethod}</p>
                        <p className="mt-1 text-sm text-slate-500">Início em {formatMonthLabel(item.startMonth)}{item.notes ? ` • ${item.notes}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-[120px] text-left text-base font-bold text-slate-900 md:text-right">{formatCurrency(item.amount)}</p>
                        <button onClick={() => openEditFixedBill(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">Editar</button>
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
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Observação</label><input type="text" placeholder="Opcional" value={fixedBillNotes} onChange={(e) => setFixedBillNotes(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900" /></div>
              <div className="flex items-end gap-3 md:col-span-2"><button type="submit" className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800">{fixedBillMode === "edit" ? "Salvar alterações" : "Salvar conta fixa"}</button><button type="button" onClick={resetFixedBillForm} className="rounded-2xl bg-slate-100 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Limpar</button></div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
