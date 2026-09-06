import { useCallback, useEffect, useRef, useState } from "react";
import VersionGate from "./VersionGate";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Center,
  Divider,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Select,
  Skeleton,
  Tooltip,
  Text,
  SimpleGrid,
  VStack,
  useDisclosure,
  useColorMode,
  useColorModeValue,
  useBreakpointValue
} from "@chakra-ui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HamburgerIcon,
  MoonIcon,
  SunIcon,
  ArrowUpIcon,
  ViewIcon,
  SettingsIcon,
  SmallCloseIcon
} from "@chakra-ui/icons";
import UploadForm from "./components/UploadForm";
import SummaryCards from "./components/SummaryCards";
import SalesByPeriodChart from "./components/SalesByPeriodChart";
import SalesByStoreChart from "./components/SalesByStoreChart";
// import SalesByStateChart from "./components/SalesByStateChart";
import SalesByPlatformChart from "./components/SalesByPlatformChart";
import AbcTable from "./components/AbcTable";
import CanceledReportDrawer from "./components/CanceledReportDrawer";
import DailySalesDrawer from "./components/DailySalesDrawer";
import UpsellerTodayDrawer from "./components/UpsellerTodayDrawer";
import LoginPage from "./components/LoginPage";
import ForgotPasswordModal from "./components/ForgotPasswordModal";
import ResetPasswordPage from "./components/ResetPasswordPage";
import UsersManagement from "./components/UsersManagement";
import DatabaseMaintenance from "./components/DatabaseMaintenance";
import SisplanSettings from "./components/SisplanSettings";
import WhatsappSettings from "./components/WhatsappSettings";
import UpsellerSettings from "./components/UpsellerSettings";
import ConversationLogs from "./components/ConversationLogs";
import DatabaseManager from "./components/DatabaseManager";
import CashFlowTabs from "./components/CashFlowTabs";
import CashFlowDashboard from "./components/CashFlowDashboard";
import TerceirosSettlement from "./components/TerceirosSettlement";
import TerceirosProductGroups from "./components/TerceirosProductGroups";
import TerceirosSupplierPrices from "./components/TerceirosSupplierPrices";
import OFRastreio from "./components/OFRastreio";
import SystemSettings from "./components/SystemSettings";
import StoresManagement from "./components/StoresManagement";
import MlProfitReport from "./components/MlProfitReport";
import AnunciosDashboard from "./components/AnunciosDashboard";
import ProductsManagement from "./components/ProductsManagement";
import OrderProductsConfig from "./components/OrderProductsConfig";
import PaymentConditionsConfig from "./components/PaymentConditionsConfig";
import NewOrder from "./components/NewOrder";
import OrdersList from "./components/OrdersList";
import OrdersCustomers from "./components/OrdersCustomers";
import ProductDashboard from "./components/ProductDashboard";
import ProductGroups from "./components/ProductGroups";
import StockProductsManagement from "./components/StockProductsManagement";
import StockControl from "./components/StockControl";
import StockSeparationDashboard from "./components/StockSeparationDashboard";
import StockInventory from "./components/StockInventory";
import StockReports from "./components/StockReports";
import StockSettings from "./components/StockSettings";
import CostPriceList from "./components/CostPriceList";
import Purchases from "./components/Purchases";
import SuppliersManagement from "./components/SuppliersManagement";
import StockOpeningCost from "./components/StockOpeningCost";
import ChannelsFees from "./components/ChannelsFees";
import Valuation from "./components/Valuation";
import Simulator from "./components/Simulator";
import AccessProfiles from "./components/AccessProfiles";
import ApiSettings from "./components/ApiSettings";
import ShopeeValidator from "./components/ShopeeValidator";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import RevenueDetailDrawer from "./components/RevenueDetailDrawer";
import { getSaoPauloDate, getSaoPauloYear, getSaoPauloMonth } from "./utils/timezone";
import {
  fetchSummary,
  fetchStores,
  fetchSalesByPeriod,
  fetchSalesByStore,
  fetchSalesByPlatform,
  fetchAbc,
  uploadFile,
  login,
  fetchMe,
  setToken,
  getToken,
  fetchSisplanActive,
  refreshSisplanData,
  refreshUpsellerTodayAnalytics,
  fetchSystemSettings,
  fetchMyModules
} from "./api";

const SIDEBAR_EXPANDED = "220px";
const SIDEBAR_COLLAPSED = "60px";

// Versão do build (injetada pelo Vite em vite.config.js). Serve para confirmar qual
// build está no ar após um deploy.
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const APP_BUILD_LABEL = typeof __BUILD_LABEL__ !== "undefined" ? __BUILD_LABEL__ : "local";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const generateMonthOptions = () => {
  const currentYear = getSaoPauloYear();
  const currentMonth = getSaoPauloMonth();
  const options = [];
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const maxM = y === currentYear ? currentMonth : 12;
    for (let m = maxM; m >= 1; m--) {
      const value = `${y}-${String(m).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[m - 1]} / ${y}`;
      options.push({ value, label });
    }
  }
  return options;
};

const MONTH_OPTIONS = generateMonthOptions();

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const defaultFilters = {
  startMonth: currentMonth,
  endMonth: currentMonth,
  store: "",
  period: "week",
  saleChannel: ""
};

const monthToStartDate = (v) => v ? `${v}-01` : "";
const monthToEndDate = (v) => {
  if (!v) return "";
  const [y, m] = v.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

const buildParams = (filters) => {
  const params = new URLSearchParams();
  params.set("start", monthToStartDate(filters.startMonth));
  params.set("end", monthToEndDate(filters.endMonth));
  if (filters.store) params.set("store", filters.store);
  if (filters.period) params.set("period", filters.period);
  if (filters.saleChannel) params.set("sale_channel", filters.saleChannel);
  return params.toString();
};

const WalletIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M21 7H3c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H3V9h18v6zm-3-3.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM3 4h18v1H3V4zm0 15h18v1H3v-1z" />
  </svg>
);

const ChartBarIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
  </svg>
);

const FactoryIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M22 22H2V10l7-3v3l7-3v3l6-3v15zM4 20h16V9.83l-4 2V8.83l-7 3V8.83l-5 2.15V20zm2-8h3v2H6v-2zm5 0h3v2h-3v-2zm5 0h3v2h-3v-2zM6 16h3v2H6v-2zm5 0h3v2h-3v-2zm5 0h3v2h-3v-2z" />
  </svg>
);

const PlayIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const StoreIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M20 4H4v2l8 5 8-5V4zm0 4.5-8 5-8-5V20h16V8.5z" />
  </svg>
);

const ProductIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M21 5l-9-4-9 4v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-9 9H5.08c-.48-3.07.68-6.23 2.92-8.38V11h6V5.62c2.24 2.15 3.4 5.31 2.92 8.38H12v5z" />
  </svg>
);

const CartIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

const AdsIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z" />
  </svg>
);

const StockIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M20 2H4c-1.1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-.9-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z" />
  </svg>
);

const OrderIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z" />
  </svg>
);

const ValidatorIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    <path d="M2 4h7v2H2zM2 8h5v2H2zM2 12h3v2H2z" />
  </svg>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetTokenUrl, setResetTokenUrl] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [hasData, setHasData] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [stores, setStores] = useState([]);
  const [summary, setSummary] = useState(null);
  const [salesByPeriod, setSalesByPeriod] = useState([]);
  const [salesByStore, setSalesByStore] = useState([]);
  const [salesByPlatform, setSalesByPlatform] = useState([]);
  const [abc, setAbc] = useState([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState(() => {
    const saved = localStorage.getItem("activeView");
    return saved && saved !== "upload" ? saved : "dashboard";
  });
  const [expandedMenu, setExpandedMenu] = useState(null); // For submenu expansion
  const [allowedModules, setAllowedModules] = useState(null); // {all:true} | {all:false, modules:[...]} | null
  const [autoplay, setAutoplay] = useState(true);
  const [sisplanActive, setSisplanActive] = useState(false);
  const [ofActive, setOfActive] = useState(false);
  const [systemLogo, setSystemLogo] = useState(null);
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Módulos permitidos ao usuário (Fase 4 — filtra o menu). Sem perfil/admin => {all:true}.
  useEffect(() => {
    if (!user) { setAllowedModules(null); return; }
    fetchMyModules().then(setAllowedModules).catch(() => setAllowedModules({ all: true }));
  }, [user]);

  const MODULE_BY_LABEL = {
    "Dashboard Vendas": "dashboard",
    "Financeiro": "financeiro",
    "Dashboard Financeiro": "financial-dashboard",
    "Anúncios": "produtos",
    "Compras": "compras",
    "Pedidos": "pedidos",
    "Estoque": "estoque",
    "Análise de Custo e Preço": "custo-preco",
    "Terceiros": "terceiros",
    "Lojas": "lojas",
    "Validador de Pedidos": "validador",
    "Configurações": "configuracoes",
  };
  // Acesso é 100% pelo PERFIL. isAdmin = perfil de acesso total (is_admin).
  const isAdmin = allowedModules?.all === true;
  // Pode ver/renderizar a tela de um módulo?
  const canView = (key) => isAdmin || (allowedModules?.modules || []).includes(key);
  // Visibilidade do item de topo do menu.
  const topVisible = (item) => {
    if (isAdmin) return item.show;                 // acesso total: usa a visibilidade padrão do item
    const key = MODULE_BY_LABEL[item.label];
    return key ? (allowedModules?.modules || []).includes(key) : false;
  };
  const mobileMenu = useDisclosure();
  const canceledDrawer = useDisclosure();
  const dailySalesDrawer = useDisclosure();
  const upsellerTodayDrawer = useDisclosure();
  const revenueDrawer = useDisclosure();
  const [dailySalesDate, setDailySalesDate] = useState("");
  const [dailySalesTitle, setDailySalesTitle] = useState("");
  const forgotModal = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const pageBg = useColorModeValue("gray.50", "gray.900");
  const sidebarBg = useColorModeValue("white", "gray.800");
  const sidebarBorder = useColorModeValue("gray.200", "gray.700");
  const navColor = useColorModeValue("gray.700", "gray.200");
  const navHoverBg = useColorModeValue("blue.50", "whiteAlpha.100");
  const navActiveBg = useColorModeValue("blue.100", "whiteAlpha.200");

  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  // Persist active view to localStorage
  useEffect(() => {
    localStorage.setItem("activeView", activeView);
  }, [activeView]);

  // Check for reset token in URL and restore session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlResetToken = params.get("reset_token");
    if (urlResetToken) {
      setResetTokenUrl(urlResetToken);
      setAuthLoading(false);
      return;
    }

    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    fetchMe()
      .then((userData) => setUser(userData))
      .catch(() => setToken(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // After authentication, check if there's existing data and sisplan status
  useEffect(() => {
    if (!user) return;
    fetchSummary("")
      .then((data) => {
        if (data && data.totalSales > 0) {
          setHasData(true);
          const saved = localStorage.getItem("activeView");
          if (!saved || saved === "upload") setActiveView("dashboard");
          loadData(filters);
        }
      })
      .catch(() => {});
    fetchSisplanActive()
      .then((data) => {
        setSisplanActive(data.active);
        setOfActive(data.ofActive || false);
      })
      .catch(() => {});
    loadSystemLogo();
  }, [user]);

  const loadSystemLogo = () => {
    fetchSystemSettings()
      .then((data) => {
        setSystemLogo(data.logoPath ? `/uploads/${data.logoPath}?t=${Date.now()}` : null);
      })
      .catch(() => {});
  };

  const handleLogin = async (email, password) => {
    const result = await login(email, password);
    setToken(result.token);
    setUser(result.user);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setHasData(false);
    setActiveView("dashboard");
  };

  const loadData = async (currentFilters) => {
    setDashLoading(true);
    try {
      const params = buildParams(currentFilters);
      const [
        summaryData,
        storeList,
        periodData,
        storeData,
        platformData,
        abcData
      ] = await Promise.all([
        fetchSummary(params),
        fetchStores(),
        fetchSalesByPeriod(params),
        fetchSalesByStore(params),
        fetchSalesByPlatform(params),
        fetchAbc(params)
      ]);

      setSummary(summaryData);
      setStores(storeList);
      setSalesByPeriod(periodData);
      setSalesByStore(storeData);
      setSalesByPlatform(platformData);
      setAbc(abcData);
    } finally {
      setDashLoading(false);
    }
  };

  const handleUpload = async (file) => {
    setError("");
    try {
      await uploadFile(file);
      setHasData(true);
      setActiveView("dashboard");
      await loadData(filters);
    } catch (err) {
      setError(err.message || "Falha no upload.");
    }
  };

  useEffect(() => {
    if (!hasData) return;
    loadData(filters).catch((err) => setError(err.message || "Erro ao carregar dados."));
  }, [filters, hasData]);

  // Auto-refresh a cada 5 minutos (silencioso, para exibição em TV)
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    if (!hasData) return;
    const id = setInterval(() => {
      loadData(filtersRef.current).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [hasData]);

  // Loading state while checking auth — splash screen handles this visually
  if (authLoading) {
    return <Box bg={pageBg} minH="100vh" />;
  }

  // Reset password page (via email link)
  if (resetTokenUrl) {
    return (
      <Box bg={pageBg} minH="100vh">
        <ResetPasswordPage
          token={resetTokenUrl}
          onSuccess={() => setResetTokenUrl(null)}
        />
      </Box>
    );
  }

  // Login page (not authenticated)
  if (!user) {
    return (
      <Box bg={pageBg} minH="100vh">
        <LoginPage onLogin={handleLogin} onForgotPassword={forgotModal.onOpen} />
        <ForgotPasswordModal isOpen={forgotModal.isOpen} onClose={forgotModal.onClose} />
      </Box>
    );
  }

  const navItems = [
    {
      label: "Importar planilha",
      icon: <ArrowUpIcon />,
      view: "upload",
      show: false
    },
    {
      label: "Dashboard Vendas",
      icon: <ViewIcon />,
      view: "dashboard",
      show: true,
      disabled: !hasData
    },
    {
      label: "Financeiro",
      icon: <WalletIcon />,
      view: "cashflow",
      show: true
    },
    {
      label: "Dashboard Financeiro",
      icon: <ChartBarIcon />,
      view: "financial-dashboard",
      show: true
    },
    {
      label: "Anúncios",
      icon: <ProductIcon />,
      show: true,
      submenu: [
        {
          label: "Dashboard de Anúncios",
          view: "products-dashboard"
        },
        {
          label: "Gerenciar Anúncios",
          view: "products-management"
        },
        {
          label: "Grupos de Anúncios",
          view: "product-groups"
        }
      ]
    },
    {
      label: "Compras",
      icon: <CartIcon />,
      view: "purchases",
      show: true
    },
    {
      label: "Pedidos",
      icon: <OrderIcon />,
      show: true,
      submenu: [
        { label: "Novo Pedido", view: "orders-new" },
        { label: "Meus Pedidos", view: "orders-list" },
        { label: "Clientes", view: "orders-customers" },
        { label: "Config Produtos",  view: "orders-products",    show: isAdmin },
        { label: "Cond. Pagamento",  view: "orders-conditions",  show: isAdmin }
      ].filter(s => s.show !== false)
    },
    {
      label: "Estoque",
      icon: <StockIcon />,
      show: true,
      submenu: [
        { label: "Dashboard de Separação", view: "stock-separation" },
        { label: "Entradas/Saídas",       view: "stock-control" },
        { label: "Inventário / Acerto",  view: "stock-inventory" },
        { label: "Relatórios",           view: "stock-reports" },
        { label: "Cadastro de Produtos", view: "stock-products",  show: isAdmin },
        { label: "Configuração",         view: "stock-settings",  show: isAdmin },
      ].filter(s => s.show !== false),
    },
    {
      label: "Análise de Custo e Preço",
      icon: <ChartBarIcon />,
      show: isAdmin,
      submenu: [
        { label: "Custos & Preços",    view: "cost-list" },
        { label: "Valorização",        view: "cost-valuation" },
        { label: "Simulador",          view: "cost-simulator" },
        { label: "Canais & Taxas",     view: "cost-channels" },
        { label: "Fornecedores",       view: "cost-suppliers" },
        { label: "Custo de Abertura",  view: "cost-opening" },
      ],
    },
    {
      label: "Terceiros",
      icon: <FactoryIcon />,
      show: ofActive,
      submenu: [
        {
          label: "Fechamento",
          view: "terceiros-settlement"
        },
        {
          label: "Grupos de Produtos",
          view: "terceiros-groups"
        },
        {
          label: "Precos por Fornecedor",
          view: "terceiros-prices"
        },
        {
          label: "Rastreio de OF",
          view: "terceiros-rastreio"
        }
      ]
    },
    {
      label: "Lojas",
      icon: <StoreIcon />,
      show: isAdmin,
      submenu: [
        { label: "Anúncios", view: "anuncios" },
        { label: "Gerenc. de Lojas", view: "stores-management" },
        { label: "Lucro ML", view: "ml-profit" },
      ],
    },
    {
      label: "Validador de Pedidos",
      icon: <ValidatorIcon />,
      show: isAdmin,
      submenu: [
        { label: "Shopee", view: "validador-shopee" },
      ],
    },
    {
      label: "Configurações",
      icon: <SettingsIcon />,
      show: isAdmin,
      submenu: [
        {
          label: "Gerenciar usuários",
          view: "users"
        },
        {
          label: "Perfis de Acesso",
          view: "access-profiles"
        },
        {
          label: "API externa",
          view: "api-settings"
        },
        {
          label: "Conexão Sisplan",
          view: "sisplan-settings"
        },
        {
          label: "Sistema",
          view: "system-settings"
        },
        {
          label: "WhatsApp Bot",
          view: "whatsapp-settings"
        },
        {
          label: "UpSeller",
          view: "upseller-settings"
        },
        {
          label: "Log do Bot",
          view: "conversation-logs"
        },
        {
          label: "Manutenção de base",
          view: "database-maintenance"
        },
        {
          label: "Gerenciador de Banco",
          view: "database-manager"
        }
      ]
    }
  ];

  const sidebarContent = (
    <>
      {/* Header */}
      <Flex align="center" justify="space-between" px={5} py={4} minH="64px">
        <Box>
          {systemLogo ? (
            <Image src={systemLogo} alt="Logo" maxH="56px" maxW="180px" objectFit="contain" />
          ) : (
            <Text fontSize="lg" fontWeight="bold" color="blue.500" whiteSpace="nowrap">
              Indicadores
            </Text>
          )}
          <Text fontSize="xs" color="gray.500" mt={1} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" maxW="140px">
            {user.name}
          </Text>
        </Box>
        {!isMobile && (
          <IconButton
            icon={sidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            aria-label={sidebarOpen ? "Recolher menu" : "Expandir menu"}
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          />
        )}
      </Flex>

      <Divider />

      {/* Navigation items */}
      <VStack spacing={1} align="stretch" px={3} py={4} flex={1}>
        {navItems.filter(topVisible).map((item) => (
          <Box key={item.view || item.label}>
            {/* Main menu item */}
            <Box
              as="button"
              display="flex"
              alignItems="center"
              justifyContent="flex-start"
              gap={3}
              px={3}
              py={2}
              borderRadius="md"
              fontSize="sm"
              fontWeight={activeView === item.view ? "semibold" : "normal"}
              color={activeView === item.view ? "blue.500" : navColor}
              bg={activeView === item.view ? navActiveBg : "transparent"}
              _hover={{ bg: item.disabled ? "transparent" : navHoverBg }}
              opacity={item.disabled ? 0.4 : 1}
              cursor={item.disabled ? "not-allowed" : "pointer"}
              onClick={() => {
                if (item.disabled) return;
                if (item.submenu) {
                  // Toggle submenu
                  setExpandedMenu(expandedMenu === item.label ? null : item.label);
                } else {
                  setActiveView(item.view);
                  if (isMobile) mobileMenu.onClose();
                }
              }}
              textAlign="left"
              w="full"
              whiteSpace="nowrap"
            >
              <Box flexShrink={0} fontSize="md">{item.icon}</Box>
              {item.label}
              {item.submenu && (
                <Box ml="auto" fontSize="xs">
                  {expandedMenu === item.label ? "▼" : "▶"}
                </Box>
              )}
            </Box>

            {/* Submenu items */}
            {item.submenu && expandedMenu === item.label && (
              <VStack spacing={0} align="stretch" pl={6} mt={1}>
                {item.submenu.map((subItem) => (
                  <Box
                    key={subItem.view}
                    as="button"
                    display="flex"
                    alignItems="center"
                    justifyContent="flex-start"
                    gap={2}
                    px={2}
                    py={1.5}
                    borderRadius="md"
                    fontSize="xs"
                    fontWeight={activeView === subItem.view ? "600" : "normal"}
                    color={activeView === subItem.view ? "blue.600" : navColor}
                    bg="transparent"
                    _hover={{ color: "blue.500" }}
                    cursor="pointer"
                    onClick={() => {
                      setActiveView(subItem.view);
                      if (isMobile) mobileMenu.onClose();
                    }}
                    textAlign="left"
                    w="full"
                    whiteSpace="nowrap"
                  >
                    <Box w="4px" h="4px" borderRadius="full" bg={activeView === subItem.view ? "blue.500" : "gray.400"} flexShrink={0} />
                    {subItem.label}
                  </Box>
                ))}
              </VStack>
            )}
          </Box>
        ))}
      </VStack>

      <Divider />

      {/* Bottom actions */}
      <VStack spacing={1} align="stretch" px={3} py={3}>
        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="flex-start"
          gap={3}
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
          color={navColor}
          _hover={{ bg: navHoverBg }}
          onClick={toggleColorMode}
          textAlign="left"
          w="full"
          whiteSpace="nowrap"
        >
          <Box flexShrink={0} fontSize="md">{colorMode === "light" ? <MoonIcon /> : <SunIcon />}</Box>
          {colorMode === "light" ? "Modo escuro" : "Modo claro"}
        </Box>
        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="flex-start"
          gap={3}
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
          color="red.400"
          _hover={{ bg: navHoverBg }}
          onClick={() => {
            handleLogout();
            if (isMobile) mobileMenu.onClose();
          }}
          textAlign="left"
          w="full"
          whiteSpace="nowrap"
        >
          <Box flexShrink={0} fontSize="md"><SmallCloseIcon /></Box>
          Sair
        </Box>
        {sidebarOpen && (
          <Text fontSize="10px" color="gray.400" px={3} pt={1} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" title={APP_BUILD_LABEL}>
            v{APP_VERSION} · {APP_BUILD_LABEL}
          </Text>
        )}
      </VStack>
    </>
  );

  // Authenticated content
  return (
    <Flex minH="100vh">
      <VersionGate />
      {/* Mobile: hamburger button + Drawer menu */}
      {isMobile && (
        <>
          <IconButton
            icon={<HamburgerIcon />}
            aria-label="Abrir menu"
            position="fixed"
            top={3}
            left={3}
            zIndex="overlay"
            colorScheme="blue"
            borderRadius="full"
            boxShadow="md"
            size="md"
            onClick={mobileMenu.onOpen}
          />
          <Drawer placement="left" isOpen={mobileMenu.isOpen} onClose={mobileMenu.onClose}>
            <DrawerOverlay />
            <DrawerContent maxW="260px">
              <DrawerCloseButton />
              <Flex direction="column" h="full">
                {sidebarContent}
              </Flex>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {/* Desktop: Fixed Sidebar */}
      {!isMobile && (
        <Box
          as="nav"
          position="fixed"
          left={0}
          top={0}
          bottom={0}
          w={sidebarWidth}
          bg={sidebarBg}
          borderRight="1px solid"
          borderColor={sidebarBorder}
          display="flex"
          flexDirection="column"
          zIndex="sticky"
          transition="width 0.2s ease"
          overflow="hidden"
        >
          {/* Desktop collapsed: show only icons */}
          {!sidebarOpen ? (
            <>
              <Flex align="center" justify="center" py={4} minH="64px">
                <IconButton
                  icon={<ChevronRightIcon />}
                  aria-label="Expandir menu"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                />
              </Flex>
              <Divider />
              <VStack spacing={1} align="stretch" px={2} py={4} flex={1}>
                {navItems.filter(topVisible).map((item) => (
                  <Tooltip key={item.view} label={item.label} placement="right">
                    <Box
                      as="button"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      px={3}
                      py={2}
                      borderRadius="md"
                      fontSize="sm"
                      fontWeight={activeView === item.view ? "semibold" : "normal"}
                      color={activeView === item.view ? "blue.500" : navColor}
                      bg={activeView === item.view ? navActiveBg : "transparent"}
                      _hover={{ bg: item.disabled ? "transparent" : navHoverBg }}
                      opacity={item.disabled ? 0.4 : 1}
                      cursor={item.disabled ? "not-allowed" : "pointer"}
                      onClick={() => { if (!item.disabled) setActiveView(item.view); }}
                      w="full"
                    >
                      <Box flexShrink={0} fontSize="md">{item.icon}</Box>
                    </Box>
                  </Tooltip>
                ))}
              </VStack>
              <Divider />
              <VStack spacing={1} align="stretch" px={2} py={3}>
                <Tooltip label={colorMode === "light" ? "Modo escuro" : "Modo claro"} placement="right">
                  <Box as="button" display="flex" alignItems="center" justifyContent="center" px={3} py={2} borderRadius="md" fontSize="sm" color={navColor} _hover={{ bg: navHoverBg }} onClick={toggleColorMode} w="full">
                    <Box flexShrink={0} fontSize="md">{colorMode === "light" ? <MoonIcon /> : <SunIcon />}</Box>
                  </Box>
                </Tooltip>
                <Tooltip label="Sair" placement="right">
                  <Box as="button" display="flex" alignItems="center" justifyContent="center" px={3} py={2} borderRadius="md" fontSize="sm" color="red.400" _hover={{ bg: navHoverBg }} onClick={handleLogout} w="full">
                    <Box flexShrink={0} fontSize="md"><SmallCloseIcon /></Box>
                  </Box>
                </Tooltip>
              </VStack>
            </>
          ) : (
            sidebarContent
          )}
        </Box>
      )}

      {/* Main content */}
      <Box
        ml={isMobile ? 0 : sidebarWidth}
        w={isMobile ? "100vw" : `calc(100vw - ${sidebarWidth})`}
        maxW={isMobile ? "100vw" : `calc(100vw - ${sidebarWidth})`}
        bg={pageBg}
        minH="100vh"
        p={{ base: 3, md: "24px" }}
        pt={isMobile ? "60px" : "24px"}
        position="relative"
        transition="margin-left 0.2s ease, width 0.2s ease, max-width 0.2s ease"
        overflowX="hidden"
      >
        {error && (
          <Alert status="error" variant="left-accent" className="panel">
            <AlertIcon />
            <Box>
              <AlertTitle>Ops!</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
          </Alert>
        )}

        <PWAInstallPrompt />

        {activeView === "upload" && (
          <Center py={10}>
            <Box maxW="680px" w="full">
              <UploadForm onUpload={handleUpload} />
            </Box>
          </Center>
        )}

        {activeView === "anuncios" && isAdmin && (
          <AnunciosDashboard />
        )}

        {activeView === "stores-management" && isAdmin && (
          <StoresManagement />
        )}

        {activeView === "ml-profit" && isAdmin && (
          <MlProfitReport />
        )}

        {activeView === "users" && isAdmin && (
          <UsersManagement />
        )}

        {activeView === "database-maintenance" && isAdmin && (
          <DatabaseMaintenance />
        )}

        {activeView === "database-manager" && isAdmin && (
          <DatabaseManager />
        )}

        {activeView === "sisplan-settings" && isAdmin && (
          <SisplanSettings />
        )}

        {activeView === "upseller-settings" && isAdmin && (
          <UpsellerSettings />
        )}

        {activeView === "whatsapp-settings" && isAdmin && (
          <WhatsappSettings />
        )}

        {activeView === "conversation-logs" && isAdmin && (
          <ConversationLogs />
        )}

        {activeView === "cashflow" && (
          <CashFlowTabs />
        )}

        {activeView === "financial-dashboard" && (
          <CashFlowDashboard />
        )}

        {activeView === "terceiros-settlement" && (
          <TerceirosSettlement />
        )}

        {activeView === "terceiros-groups" && (
          <TerceirosProductGroups />
        )}

        {activeView === "terceiros-prices" && (
          <TerceirosSupplierPrices />
        )}

        {activeView === "terceiros-rastreio" && (
          <OFRastreio />
        )}

        {activeView === "system-settings" && isAdmin && (
          <SystemSettings onLogoChange={() => loadSystemLogo()} />
        )}

        {activeView === "products-dashboard" && (
          <ProductDashboard />
        )}

        {activeView === "purchases" && canView("compras") && (
          <Purchases />
        )}

        {activeView === "products-management" && (
          <ProductsManagement />
        )}

        {activeView === "product-groups" && (
          <ProductGroups />
        )}

        {activeView === "orders-new" && (
          <NewOrder />
        )}

        {activeView === "orders-list" && (
          <OrdersList />
        )}

        {activeView === "orders-customers" && (
          <OrdersCustomers />
        )}

        {activeView === "orders-products" && isAdmin && (
          <OrderProductsConfig />
        )}

        {activeView === "orders-conditions" && isAdmin && (
          <PaymentConditionsConfig />
        )}

        {activeView === "validador-shopee" && isAdmin && (
          <ShopeeValidator />
        )}

        {activeView === "stock-separation" && (
          <StockSeparationDashboard />
        )}

        {activeView === "stock-control" && (
          <StockControl />
        )}

        {activeView === "stock-inventory" && (
          <StockInventory />
        )}

        {activeView === "stock-reports" && (
          <StockReports />
        )}

        {activeView === "stock-products" && isAdmin && (
          <StockProductsManagement />
        )}

        {activeView === "stock-settings" && isAdmin && (
          <StockSettings />
        )}

        {activeView === "cost-list" && canView("custo-preco") && (
          <CostPriceList />
        )}

        {activeView === "cost-valuation" && canView("custo-preco") && (
          <Valuation />
        )}

        {activeView === "cost-simulator" && canView("custo-preco") && (
          <Simulator />
        )}

        {activeView === "cost-channels" && canView("custo-preco") && (
          <ChannelsFees />
        )}

        {activeView === "cost-suppliers" && canView("custo-preco") && (
          <SuppliersManagement />
        )}

        {activeView === "access-profiles" && isAdmin && (
          <AccessProfiles />
        )}

        {activeView === "api-settings" && isAdmin && (
          <ApiSettings />
        )}

        {activeView === "cost-opening" && canView("custo-preco") && (
          <StockOpeningCost />
        )}

        {hasData && activeView === "dashboard" && (
          <>
            {/* Top bar: period selectors + filters */}
            {isMobile ? (
              <VStack align="stretch" spacing={3} mb={6}>
                <SimpleGrid columns={2} spacing={2}>
                  <FormControl>
                    <FormLabel fontSize="xs" mb={1}>De</FormLabel>
                    <Select size="sm" value={filters.startMonth} onChange={(e) => setFilters(f => ({ ...f, startMonth: e.target.value }))}>
                      {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
                    <Select size="sm" value={filters.endMonth} onChange={(e) => setFilters(f => ({ ...f, endMonth: e.target.value }))}>
                      {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>
                  </FormControl>
                </SimpleGrid>
                <Select
                  size="sm"
                  value={filters.store}
                  onChange={(e) => setFilters(f => ({ ...f, store: e.target.value }))}
                >
                  <option value="">Todas as lojas</option>
                  {stores.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                {sisplanActive && (
                  <Select
                    size="sm"
                    value={filters.saleChannel}
                    onChange={(e) => setFilters(f => ({ ...f, saleChannel: e.target.value }))}
                  >
                    <option value="">Todos os canais</option>
                    <option value="online">Online</option>
                    <option value="atacado">Atacado</option>
                  </Select>
                )}
                <Tooltip label={autoplay ? "Pausar animações" : "Ativar animações"} placement="top">
                  <IconButton
                    icon={autoplay ? <PauseIcon /> : <PlayIcon />}
                    size="sm"
                    variant="ghost"
                    aria-label={autoplay ? "Pausar animações" : "Ativar animações"}
                    onClick={() => setAutoplay((v) => !v)}
                    alignSelf="flex-end"
                  />
                </Tooltip>
              </VStack>
            ) : (
              <Flex justify="flex-start" align="flex-end" mb={6} wrap="wrap" gap={3}>
                <FormControl w="180px">
                  <FormLabel fontSize="xs" mb={1}>De</FormLabel>
                  <Select size="sm" value={filters.startMonth} onChange={(e) => setFilters(f => ({ ...f, startMonth: e.target.value }))}>
                    {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </Select>
                </FormControl>
                <FormControl w="180px">
                  <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
                  <Select size="sm" value={filters.endMonth} onChange={(e) => setFilters(f => ({ ...f, endMonth: e.target.value }))}>
                    {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </Select>
                </FormControl>
                <FormControl w="180px">
                  <FormLabel fontSize="xs" mb={1}>Loja</FormLabel>
                  <Select size="sm" value={filters.store} onChange={(e) => setFilters(f => ({ ...f, store: e.target.value }))}>
                    <option value="">Todas as lojas</option>
                    {stores.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormControl>
                {sisplanActive && (
                  <FormControl w="180px">
                    <FormLabel fontSize="xs" mb={1}>Tipo de venda</FormLabel>
                    <Select size="sm" value={filters.saleChannel} onChange={(e) => setFilters(f => ({ ...f, saleChannel: e.target.value }))}>
                      <option value="">Todos os canais</option>
                      <option value="online">Online</option>
                      <option value="atacado">Atacado</option>
                    </Select>
                  </FormControl>
                )}
                <Tooltip label={autoplay ? "Pausar animações" : "Ativar animações"} placement="top">
                  <IconButton
                    icon={autoplay ? <PauseIcon /> : <PlayIcon />}
                    size="sm"
                    variant="ghost"
                    aria-label={autoplay ? "Pausar animações" : "Ativar animações"}
                    onClick={() => setAutoplay((v) => !v)}
                    alignSelf="flex-end"
                    mb="1px"
                  />
                </Tooltip>
              </Flex>
            )}

            {dashLoading && !summary ? (
              <>
                <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={4}>
                  {[1,2,3,4].map(i => (
                    <Box key={i} p={4} borderRadius="lg" borderWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
                      <Skeleton height="12px" width="60%" mb={2} />
                      <Skeleton height="28px" width="80%" />
                    </Box>
                  ))}
                </SimpleGrid>
                <Box p={4} borderRadius="lg" borderWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.600" }} mb={4}>
                  <Skeleton height="200px" borderRadius="md" />
                </Box>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
                  <Box p={4} borderRadius="lg" borderWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
                    <Skeleton height="200px" borderRadius="md" />
                  </Box>
                  <Box p={4} borderRadius="lg" borderWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
                    <Skeleton height="200px" borderRadius="md" />
                  </Box>
                </SimpleGrid>
              </>
            ) : (
              <SummaryCards
                summary={summary}
                sisplanActive={sisplanActive}
                onCanceledClick={canceledDrawer.onOpen}
                onTodayClick={() => {
                  upsellerTodayDrawer.onOpen();
                }}
                onRevenueClick={revenueDrawer.onOpen}
                onYesterdayClick={() => {
                  setDailySalesDate(getSaoPauloDate(-1));
                  setDailySalesTitle("Vendas Ontem");
                  dailySalesDrawer.onOpen();
                }}
                onRefresh={() => loadData(filters)}
                onRefreshFabrica={async () => {
                  await refreshSisplanData();
                  await loadData(filters);
                }}
                onRefreshOnline={async () => {
                  await refreshUpsellerTodayAnalytics();
                  await loadData(filters);
                }}
              />
            )}
            <CanceledReportDrawer
              isOpen={canceledDrawer.isOpen}
              onClose={canceledDrawer.onClose}
              filters={{ ...filters, start: monthToStartDate(filters.startMonth), end: monthToEndDate(filters.endMonth) }}
            />
            <DailySalesDrawer
              isOpen={dailySalesDrawer.isOpen}
              onClose={dailySalesDrawer.onClose}
              date={dailySalesDate}
              title={dailySalesTitle}
              filters={filters}
            />
            <UpsellerTodayDrawer
              isOpen={upsellerTodayDrawer.isOpen}
              onClose={upsellerTodayDrawer.onClose}
              sisplanActive={sisplanActive}
            />
            <RevenueDetailDrawer
              isOpen={revenueDrawer.isOpen}
              onClose={revenueDrawer.onClose}
              filters={{ ...filters, start: monthToStartDate(filters.startMonth), end: monthToEndDate(filters.endMonth) }}
              summary={summary}
            />
            <SalesByPeriodChart data={salesByPeriod} period={filters.period} onPeriodChange={(value) => setFilters(f => ({ ...f, period: value }))} autoplay={autoplay} />
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <SalesByStoreChart data={salesByStore} autoplay={autoplay} />
              <SalesByPlatformChart data={salesByPlatform} autoplay={autoplay} />
            </SimpleGrid>
            <AbcTable data={abc} filters={{ ...filters, start: monthToStartDate(filters.startMonth), end: monthToEndDate(filters.endMonth) }} autoplay={autoplay} />
          </>
        )}
      </Box>
    </Flex>
  );
};

export default App;
