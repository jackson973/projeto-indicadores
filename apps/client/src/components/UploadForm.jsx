import { useState } from "react";
import { Box, Button, Flex, Input, Text, HStack, useColorModeValue } from "@chakra-ui/react";
import { AttachmentIcon } from "@chakra-ui/icons";

const UploadForm = ({ onUpload }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const panelBg = useColorModeValue("white", "gray.800");
  const helperColor = useColorModeValue("gray.500", "gray.300");

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    try {
      await onUpload(file);
    } finally {
      setLoading(false);
    }
  };

  return (
  <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        <HStack spacing={2}>
          <AttachmentIcon color="blue.500" />
          <span>Importar planilha</span>
        </HStack>
      </Text>
      <Flex className="upload-row" align="center">
        <Input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          maxW="320px"
        />
        <Button colorScheme="blue" onClick={handleSubmit} isLoading={loading} isDisabled={!file}>
          Enviar
        </Button>
        <Text fontSize="sm" color={helperColor}>
          CSV ou XLSX com exportação do UpSeller
        </Text>
      </Flex>
    </Box>
  );
};

export default UploadForm;
