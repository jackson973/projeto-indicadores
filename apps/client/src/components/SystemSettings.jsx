import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Image,
  Input,
  Text,
  VStack,
  useColorModeValue,
  useToast
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";
import {
  fetchSystemSettings,
  updateSystemSettings,
  uploadSystemLogo,
  deleteSystemLogo,
  uploadPwaIcon,
  deletePwaIcon
} from "../api";

const SystemSettings = ({ onLogoChange }) => {
  const [form, setForm] = useState({ companyName: "" });
  const [logoUrl, setLogoUrl] = useState(null);
  const [pwaIconUrl, setPwaIconUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingPwa, setUploadingPwa] = useState(false);
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchSystemSettings();
      setForm({ companyName: data.companyName || "" });
      setLogoUrl(data.logoPath ? `/uploads/${data.logoPath}?t=${Date.now()}` : null);
      setPwaIconUrl(data.pwaIconPath ? `/uploads/${data.pwaIconPath}?t=${Date.now()}` : null);
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({ companyName: form.companyName });
      toast({ title: "Configuracoes salvas!", status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadSystemLogo(file);
      setLogoUrl(`/uploads/${result.logoPath}?t=${Date.now()}`);
      toast({ title: "Logo atualizada!", status: "success", duration: 3000 });
      onLogoChange?.();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleLogoDelete = async () => {
    try {
      await deleteSystemLogo();
      setLogoUrl(null);
      toast({ title: "Logo removida.", status: "success", duration: 3000 });
      onLogoChange?.();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    }
  };

  const handlePwaIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPwa(true);
    try {
      const result = await uploadPwaIcon(file);
      setPwaIconUrl(`/uploads/${result.pwaIconPath}?t=${Date.now()}`);
      toast({ title: "Icone PWA atualizado!", status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setUploadingPwa(false);
      e.target.value = "";
    }
  };

  const handlePwaIconDelete = async () => {
    try {
      await deletePwaIcon();
      setPwaIconUrl(null);
      toast({ title: "Icone PWA removido.", status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    }
  };

  if (loading) {
    return (
      <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="600px" mx="auto" mt={8}>
        <Text>Carregando...</Text>
      </Box>
    );
  }

  return (
    <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="600px" mx="auto" mt={8}>
      <Text fontSize="lg" fontWeight="bold" mb={6}>Configuracoes do Sistema</Text>

      <VStack spacing={5} align="stretch">
        <FormControl>
          <FormLabel fontSize="sm">Nome da Empresa</FormLabel>
          <Input
            size="sm"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            placeholder="Nome que aparecera nos relatorios"
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm">Logo do Sistema</FormLabel>
          {logoUrl && (
            <Flex align="center" gap={4} mb={3} p={3} borderWidth="1px" borderRadius="md">
              <Image src={logoUrl} alt="Logo" maxH="60px" maxW="200px" objectFit="contain" />
              <Button size="xs" colorScheme="red" variant="ghost" leftIcon={<DeleteIcon />} onClick={handleLogoDelete}>
                Remover
              </Button>
            </Flex>
          )}
          <HStack>
            <Button
              as="label"
              size="sm"
              colorScheme="blue"
              variant="outline"
              cursor="pointer"
              isLoading={uploading}
              loadingText="Enviando..."
            >
              {logoUrl ? "Alterar Logo" : "Enviar Logo"}
              <input type="file" accept="image/*" hidden onChange={handleLogoUpload} />
            </Button>
            <Text fontSize="xs" color="gray.500">PNG, JPG, SVG ou WEBP (max 2MB)</Text>
          </HStack>
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm">Icone do App (PWA)</FormLabel>
          <Text fontSize="xs" color="gray.500" mb={2}>
            Icone exibido na tela inicial do celular ao instalar o app. Use uma imagem quadrada, preferencialmente 512x512px.
          </Text>
          {pwaIconUrl && (
            <Flex align="center" gap={4} mb={3} p={3} borderWidth="1px" borderRadius="md">
              <Image src={pwaIconUrl} alt="Icone PWA" boxSize="60px" objectFit="contain" borderRadius="md" />
              <Button size="xs" colorScheme="red" variant="ghost" leftIcon={<DeleteIcon />} onClick={handlePwaIconDelete}>
                Remover
              </Button>
            </Flex>
          )}
          <HStack>
            <Button
              as="label"
              size="sm"
              colorScheme="blue"
              variant="outline"
              cursor="pointer"
              isLoading={uploadingPwa}
              loadingText="Enviando..."
            >
              {pwaIconUrl ? "Alterar Icone" : "Enviar Icone"}
              <input type="file" accept="image/*" hidden onChange={handlePwaIconUpload} />
            </Button>
            <Text fontSize="xs" color="gray.500">PNG, JPG, SVG ou WEBP (max 2MB)</Text>
          </HStack>
        </FormControl>

        <Flex justify="flex-end">
          <Button
            colorScheme="blue"
            isLoading={saving}
            loadingText="Salvando..."
            onClick={handleSave}
          >
            Salvar
          </Button>
        </Flex>
      </VStack>
    </Box>
  );
};

export default SystemSettings;
