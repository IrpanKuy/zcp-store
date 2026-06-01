import { api } from "./api.js";

const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    const currentView = ref("dashboard");
    const loading = ref(false);
    const online = ref(navigator.onLine);
    const filterTipe = ref("All");

    // Page Configurations
    const views = {
      dashboard: {
        title: "Halo, Sabloners!",
        subtitle: "Berikut ringkasan bisnis sablon Anda hari ini.",
      },
      finance: {
        title: "Log Keuangan",
        subtitle: "Pantau semua arus kas masuk dan keluar secara detail.",
      },
      report: {
        title: "Analisis Performa",
        subtitle: "Visualisasi keuntungan dan pola pengeluaran bisnis.",
      },
      inventory: {
        title: "Gudang & Stok",
        subtitle: "Kelola bahan baku kaos, tinta, dan perlengkapan lainnya.",
      },
      debt: {
        title: "Utang Piutang",
        subtitle: "Jangan biarkan tagihan menumpuk tanpa pengawasan.",
      },
      category: {
        title: "Setup Kategori",
        subtitle: "Organisir transaksi dan barang agar lebih terstruktur.",
      },
    };

    // Data Store
    const db = reactive({
      transaksi: [],
      produk: [],
      utang: [],
      recurring: [],
      kategori: [],
    });

    // Forms
    const modals = reactive({ transaction: false, stock: false });
    const formTx = reactive({
      tanggal: new Date().toISOString().split("T")[0],
      tipe: "Masuk",
      nominal: 0,
      kategori: "Umum",
      keterangan: "",
    });
    const formStock = reactive({
      id_produk: "",
      jenis: "Keluar",
      jumlah: 1,
      keterangan: "Manual",
    });
    const formKat = reactive({ nama: "", tipe: "Transaksi" });

    // --- CORE logic ---

    const loadCache = () => {
      const data = localStorage.getItem("sablon_enterprise_db");
      if (data) {
        const parsed = JSON.parse(data);
        Object.assign(db, parsed);
      }
    };

    const syncData = async () => {
      if (!online.value) return;
      loading.value = true;
      try {
        const res = await api.send("getInitialData", {});
        if (res && res.status === "success") {
          Object.assign(db, res.data);
          localStorage.setItem("sablon_enterprise_db", JSON.stringify(db));
        }
      } catch (err) {
        console.error("Sync Error:", err);
      } finally {
        loading.value = false;
      }
    };

    // --- ACTIONS ---

    const submitTransaction = async () => {
      const backup = JSON.stringify(db.transaksi);
      const newItem = { ...formTx, id_tx: "TEMP-" + Date.now() };

      db.transaksi.unshift(newItem);
      closeModals();

      try {
        const res = await api.send("addTransaction", formTx);
        if (res.status === "success") {
          await syncData();
        } else throw new Error();
      } catch (err) {
        db.transaksi = JSON.parse(backup);
        alert("🔴 Gagal Sinkron Keuangan! Rollback data lokal.");
      }
    };

    const submitStock = async () => {
      const backup = JSON.stringify(db.produk);
      const p = db.produk.find((x) => x.id_produk === formStock.id_produk);
      if (p) {
        if (formStock.jenis === "Masuk") p.stok_sekarang += formStock.jumlah;
        else p.stok_sekarang -= formStock.jumlah;
      }
      closeModals();
      try {
        const res = await api.send("mutateStock", formStock);
        if (res.status === "success") await syncData();
        else throw new Error();
      } catch (err) {
        db.produk = JSON.parse(backup);
        alert("🔴 Gagal Update Stok! Rollback dilakukan.");
      }
    };

    const addCategory = async () => {
      if (!formKat.nama) return alert("Pilih nama kategori!");
      try {
        loading.value = true;
        const res = await api.send("manageCategory", {
          mode: "add",
          nama: formKat.nama,
          tipe: formKat.tipe,
        });
        if (res.status === "success") {
          formKat.nama = "";
          await syncData();
        }
      } catch (err) {
        alert("Gagal tambah kategori.");
      } finally {
        loading.value = false;
      }
    };

    const deleteCategory = async (id) => {
      if (!confirm("Hapus kategori ini?")) return;
      try {
        loading.value = true;
        const res = await api.send("manageCategory", { mode: "delete", id });
        if (res.status === "success") await syncData();
      } catch (err) {
        alert("Gagal hapus kategori.");
      } finally {
        loading.value = false;
      }
    };

    const updateDebt = async (id, sisa) => {
      const backup = JSON.stringify(db.utang);
      const item = db.utang.find((x) => x.id_up === id);
      if (item) {
        item.sisa = sisa;
        item.status = sisa <= 0 ? "Lunas" : "Belum Lunas";
      }
      try {
        await api.send("updateDebt", { id_up: id, sisa });
        await syncData();
      } catch (err) {
        db.utang = JSON.parse(backup);
        alert("Gagal update utang.");
      }
    };

    // --- COMPUTED STATS ---

    const stats = computed(() => {
      const now = new Date();
      const income = db.transaksi
        .filter((t) => t.tipe === "Masuk")
        .reduce((a, b) => a + Number(b.nominal), 0);
      const expense = db.transaksi
        .filter((t) => t.tipe === "Keluar")
        .reduce((a, b) => a + Number(b.nominal), 0);

      const monthlyInc = db.transaksi
        .filter(
          (t) =>
            t.tipe === "Masuk" &&
            new Date(t.tanggal).getMonth() === now.getMonth(),
        )
        .reduce((a, b) => a + Number(b.nominal), 0);

      return {
        income,
        expense,
        monthlyIncome: monthlyInc,
        profit: income - expense,
        debt: db.utang
          .filter((u) => u.status !== "Lunas")
          .reduce((a, b) => a + Number(b.sisa), 0),
        lowStock: db.produk.filter((p) => p.stok_sekarang <= p.stok_minimum)
          .length,
      };
    });

    // Report Analytics Logic
    const reportStats = computed(() => {
      // 1. Top Categories Expense
      const expByKat = {};
      db.transaksi
        .filter((t) => t.tipe === "Keluar")
        .forEach((t) => {
          expByKat[t.kategori] =
            (expByKat[t.kategori] || 0) + Number(t.nominal);
        });
      const maxExp = Math.max(...Object.values(expByKat), 1);
      const topExp = Object.entries(expByKat)
        .map(([name, total]) => ({
          name,
          total,
          percent: (total / maxExp) * 100,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      // 2. Monthly Growth (Last 6 Months)
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "Mei",
        "Jun",
        "Jul",
        "Agu",
        "Sep",
        "Okt",
        "Nov",
        "Des",
      ];
      const monthlyData = {};
      db.transaksi
        .filter((t) => t.tipe === "Masuk")
        .forEach((t) => {
          const d = new Date(t.tanggal);
          const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
          monthlyData[key] = (monthlyData[key] || 0) + Number(t.nominal);
        });
      const maxMon = Math.max(...Object.values(monthlyData), 1);
      const growth = Object.entries(monthlyData)
        .map(([month, total]) => ({
          month,
          total,
          percent: (total / maxMon) * 100,
        }))
        .slice(-6);

      return { topExpenses: topExp, monthlyGrowth: growth };
    });

    const filteredTransactions = computed(() => {
      if (filterTipe.value === "All") return db.transaksi;
      return db.transaksi.filter((t) => t.tipe === filterTipe.value);
    });

    const recentTransactions = computed(() => [...db.transaksi].slice(0, 4));
    const lowStockItems = computed(() =>
      db.produk.filter((p) => p.stok_sekarang <= p.stok_minimum),
    );

    // --- UTILS ---

    const formatIDR = (val) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(val);
    const formatDate = (d) => {
      if (!d) return "-";
      return new Date(d).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    };
    const openModal = (type) => {
      modals[type] = true;
    };
    const closeModals = () => {
      modals.transaction = false;
      modals.stock = false;
    };

    onMounted(() => {
      loadCache();
      syncData();
      window.addEventListener("online", () => (online.value = true));
      window.addEventListener("offline", () => (online.value = false));
    });

    return {
      currentView,
      views,
      db,
      loading,
      online,
      modals,
      formTx,
      formStock,
      formKat,
      filterTipe,
      stats,
      reportStats,
      filteredTransactions,
      recentTransactions,
      lowStockItems,
      formatIDR,
      formatDate,
      syncData,
      openModal,
      closeModals,
      submitTransaction,
      submitStock,
      updateDebt,
      addCategory,
      deleteCategory,
    };
  },
}).mount("#app");
