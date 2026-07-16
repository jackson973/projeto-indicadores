import { useState } from "react";
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import CashFlow from "./CashFlow";
import CashFlowConsolidated from "./CashFlowConsolidated";

// Financeiro: aba "Por caixa" (tela original, com escrita) e aba "Consolidado"
// (todos os caixas ativos, somente leitura)
const CashFlowTabs = () => {
  const [tabIndex, setTabIndex] = useState(() => {
    const saved = parseInt(localStorage.getItem("cashflow_activeTab"));
    return saved === 1 ? 1 : 0;
  });

  const handleChange = (index) => {
    setTabIndex(index);
    localStorage.setItem("cashflow_activeTab", index);
  };

  return (
    <Tabs colorScheme="blue" isLazy index={tabIndex} onChange={handleChange}>
      <TabList mb={4}>
        <Tab>Por caixa</Tab>
        <Tab>Consolidado</Tab>
      </TabList>
      <TabPanels>
        <TabPanel p={0}>
          <CashFlow />
        </TabPanel>
        <TabPanel p={0}>
          <CashFlowConsolidated />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};

export default CashFlowTabs;
