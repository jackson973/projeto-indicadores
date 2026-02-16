import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Center,
  Divider,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  IconButton,
  Spinner,
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
import Filters from "./components/Filters";
import SummaryCards from "./components/SummaryCards";
import SalesByPeriodChart from "./components/SalesByPeriodChart";
import SalesByStoreChart from "./components/SalesByStoreChart";
import SalesByStateChart from "./components/SalesByStateChart";
import SalesByPlatformChart from "./components/SalesByPlatformChart";
import AbcTable from "./components/AbcTable";
import CanceledReportDrawer from "./components/CanceledReportDrawer";
import LoginPage from "./components/LoginPage";
import ForgotPasswordModal from "./components/ForgotPasswordModal";
import ResetPasswordPage from "./components/ResetPasswordPage";
import UsersManagement from "./components/UsersManagement";
import CashFlow from "./components/CashFlow";
import CashFlowDashboard from "./components/CashFlowDashboard";
import {
  fetchSummary,
  fetchStores,
  fetchStates,
  fetchSalesByPeriod,
  fetchSalesByStore,
  fetchSalesByState,
  fetchSalesByPlatform,
  fetchAbc,
  uploadFile,
  login,
  fetchMe,
  setToken,
  getToken
} from "./api";

const SIDEBAR_EXPANDED = "220px";
const SIDEBAR_COLLAPSED = "60px";

const defaultFilters = {
  start: "",
  end: "",
  store: "",
  state: "",
  period: "month"
};

const buildParams = (filters) => {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.store) params.set("store", filters.store);
  if (filters.state) params.set("state", filters.state);
  if (filters.period) params.set("period", filters.period);
  return params.toString();
};

const FilterIcon = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
  </svg>
);

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

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetTokenUrl, setResetTokenUrl] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [hasData, setHasData] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [stores, setStores] = useState([]);
  const [states, setStates] = useState([]);
  const [summary, setSummary] = useState(null);
  const [salesByPeriod, setSalesByPeriod] = useState([]);
  const [salesByStore, setSalesByStore] = useState([]);
  const [salesByState, setSalesByState] = useState([]);
  const [salesByPlatform, setSalesByPlatform] = useState([]);
  const [abc, setAbc] = useState([]);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("upload");
  const isMobile = useBreakpointValue({ base: true, md: false });
  const mobileMenu = useDisclosure();
  const filtersDrawer = useDisclosure();
  const canceledDrawer = useDisclosure();
  const forgotModal = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const pageBg = useColorModeValue("gray.50", "gray.900");
  const sidebarBg = useColorModeValue("white", "gray.800");
  const sidebarBorder = useColorModeValue("gray.200", "gray.700");
  const navColor = useColorModeValue("gray.700", "gray.200");
  const navHoverBg = useColorModeValue("blue.50", "whiteAlpha.100");
  const navActiveBg = useColorModeValue("blue.100", "whiteAlpha.200");

  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

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

  // After authentication, check if there's existing data in the database
  useEffect(() => {
    if (!user) return;
    fetchSummary("")
      .then((data) => {
        if (data && data.totalSales > 0) {
          setHasData(true);
          setActiveView("dashboard");
          loadData(filters);
        }
      })
      .catch(() => {});
  }, [user]);

  const handleLogin = async (email, password) => {
    const result = await login(email, password);
    setToken(result.token);
    setUser(result.user);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setHasData(false);
    setActiveView("upload");
  };

  const loadData = async (currentFilters) => {
    const params = buildParams(currentFilters);
    const [
      summaryData,
      storeList,
      stateList,
      periodData,
      storeData,
      stateData,
      platformData,
      abcData
    ] = await Promise.all([
      fetchSummary(params),
      fetchStores(),
      fetchStates(),
      fetchSalesByPeriod(params),
      fetchSalesByStore(params),
      fetchSalesByState(params),
      fetchSalesByPlatform(params),
      fetchAbc(params)
    ]);

    setSummary(summaryData);
    setStores(storeList);
    setStates(stateList);
    setSalesByPeriod(periodData);
    setSalesByStore(storeData);
    setSalesByState(stateData);
    setSalesByPlatform(platformData);
    setAbc(abcData);
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

  // Loading state while checking auth
  if (authLoading) {
    return (
      <Box bg={pageBg} minH="100vh">
        <Center minH="100vh">
          <Spinner size="xl" color="blue.500" />
        </Center>
      </Box>
    );
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
      show: true
    },
    {
      label: "Dashboard",
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
      label: "Gerenciar usuários",
      icon: <SettingsIcon />,
      view: "users",
      show: user?.role === "admin"
    }
  ];

  const sidebarContent = (
    <>
      {/* Header */}
      <Flex align="center" justify="space-between" px={5} py={4} minH="64px">
        <Box>
          <Text fontSize="lg" fontWeight="bold" color="blue.500" whiteSpace="nowrap">
            Indicadores
          </Text>
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
        {navItems.filter((item) => item.show).map((item) => (
          <Box
            key={item.view}
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
              if (!item.disabled) {
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
      </VStack>
    </>
  );

  // Authenticated content
  return (
    <Flex minH="100vh">
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
                {navItems.filter((item) => item.show).map((item) => (
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

        {(activeView === "upload" || !hasData) && activeView !== "users" && activeView !== "cashflow" && activeView !== "financial-dashboard" && (
          <Center py={10}>
            <Box maxW="680px" w="full">
              <UploadForm onUpload={handleUpload} />
            </Box>
          </Center>
        )}

        {activeView === "users" && user?.role === "admin" && (
          <UsersManagement />
        )}

        {activeView === "cashflow" && (
          <CashFlow />
        )}

        {activeView === "financial-dashboard" && (
          <CashFlowDashboard />
        )}

        {hasData && activeView === "dashboard" && (
          <>
            {/* Filter button - top right (hidden when drawer is open) */}
            {!filtersDrawer.isOpen && (
              <Tooltip label="Filtros">
                <IconButton
                  icon={<FilterIcon />}
                  aria-label="Abrir filtros"
                  position="fixed"
                  top={4}
                  right={4}
                  zIndex="popover"
                  colorScheme="blue"
                  borderRadius="full"
                  boxShadow="md"
                  onClick={filtersDrawer.onOpen}
                />
              </Tooltip>
            )}

            <Drawer placement="right" size="sm" isOpen={filtersDrawer.isOpen} onClose={filtersDrawer.onClose}>
              <DrawerOverlay />
              <DrawerContent>
                <DrawerCloseButton />
                <DrawerHeader>Filtros</DrawerHeader>
                <DrawerBody>
                  <Filters
                    filters={filters}
                    stores={stores}
                    states={states}
                    onChange={setFilters}
                    variant="drawer"
                  />
                </DrawerBody>
              </DrawerContent>
            </Drawer>
            <SummaryCards summary={summary} onCanceledClick={canceledDrawer.onOpen} />
            <CanceledReportDrawer
              isOpen={canceledDrawer.isOpen}
              onClose={canceledDrawer.onClose}
              filters={filters}
            />
            <SalesByPeriodChart
              data={salesByPeriod}
              period={filters.period}
              onPeriodChange={(period) => setFilters((current) => ({ ...current, period }))}
            />
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <SalesByStoreChart data={salesByStore} />
              <SalesByPlatformChart data={salesByPlatform} />
            </SimpleGrid>
            <SalesByStateChart data={salesByState} />
            <AbcTable data={abc} filters={filters} />
          </>
        )}
      </Box>
    </Flex>
  );
};

export default App;
