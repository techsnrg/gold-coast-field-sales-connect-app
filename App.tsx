import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ApiClient, ApiError, DEFAULT_BASE_URL } from "./src/lib/api";
import { clearSession, loadSession, saveSession, StoredSession } from "./src/lib/session";
import {
  CustomerSearchResult,
  DashboardSummary,
  ItemSearchResult,
  MeResponse,
  QuotationDetail,
  QuotationInputItem,
  QuotationListItem
} from "./src/lib/types";

type Tab = "home" | "quotations" | "profile";
type QuotationStatus = "All" | "Draft" | "Submitted";
type DraftItem = ItemSearchResult & { qty: number };

const quotationListCache: {
  items: QuotationListItem[];
  status: QuotationStatus;
  query: string;
  loaded: boolean;
} = {
  items: [],
  status: "All",
  query: "",
  loaded: false
};

const recentCustomersCache: CustomerSearchResult[] = [];

function getRecentCustomers() {
  if (recentCustomersCache.length) {
    return recentCustomersCache;
  }

  const seen = new Set<string>();
  return quotationListCache.items
    .filter((row) => {
      if (seen.has(row.customer)) {
        return false;
      }
      seen.add(row.customer);
      return true;
    })
    .slice(0, 5)
    .map((row) => ({
      name: row.customer,
      customer_name: row.customer_name
    }));
}

export default function App() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setBooting(false));
  }, []);

  const api = useMemo(() => new ApiClient(session?.baseUrl || DEFAULT_BASE_URL, session?.cookie), [session]);

  if (booting) {
    return (
      <ScreenShell>
        <Centered>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Starting Gold Coast Field Connect...</Text>
        </Centered>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLoggedIn={async (nextSession) => {
          await saveSession(nextSession);
          setSession(nextSession);
        }}
      />
    );
  }

  return (
    <MainApp
      api={api}
      onLogout={async () => {
        await clearSession();
        setSession(null);
      }}
    />
  );
}

function MainApp({ api, onLogout }: { api: ApiClient; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [selectedQuotation, setSelectedQuotation] = useState<string | null>(null);
  const [creatingQuotation, setCreatingQuotation] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<QuotationDetail | null>(null);

  function startCreateQuotation() {
    setEditingQuotation(null);
    setCreatingQuotation(true);
  }

  return (
    <ScreenShell>
      <StatusBar style="dark" />
      <View style={styles.appHeader}>
        <View style={styles.brandLogo}>
          <Text style={styles.brandLogoMark}>G</Text>
          <View>
            <Text style={styles.brandLogoTitle}>GOLD COAST</Text>
            <Text style={styles.brandLogoSubtitle}>ELECTRICALS</Text>
          </View>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandEyebrow}>Gold Coast</Text>
          <Text style={styles.brandTitle}>Field Connect</Text>
        </View>
      </View>

      <View style={styles.content}>
        {creatingQuotation ? (
          <CreateQuotationScreen
            api={api}
            initialQuotation={editingQuotation}
            onBack={() => {
              setCreatingQuotation(false);
              setEditingQuotation(null);
            }}
            onSaved={(quotation) => {
              quotationListCache.loaded = false;
              setCreatingQuotation(false);
              setEditingQuotation(null);
              setSelectedQuotation(quotation);
            }}
          />
        ) : selectedQuotation ? (
          <QuotationDetailScreen
            api={api}
            quotation={selectedQuotation}
            onBack={() => setSelectedQuotation(null)}
            onEdit={(detail) => {
              setSelectedQuotation(null);
              setEditingQuotation(detail);
              setCreatingQuotation(true);
            }}
            onSubmitted={() => {
              quotationListCache.loaded = false;
              setSelectedQuotation(null);
              setTab("quotations");
            }}
          />
        ) : tab === "home" ? (
          <HomeScreen
            api={api}
            onCreateQuotation={startCreateQuotation}
            onOpenQuotations={() => setTab("quotations")}
          />
        ) : tab === "quotations" ? (
          <QuotationsScreen api={api} onSelect={setSelectedQuotation} onCreateQuotation={startCreateQuotation} />
        ) : (
          <ProfileScreen api={api} onLogout={onLogout} />
        )}
      </View>

      {!selectedQuotation && !creatingQuotation && <BottomTabs active={tab} onChange={setTab} />}
    </ScreenShell>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (session: StoredSession) => void }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    setLoading(true);
    setError("");

    try {
      const client = new ApiClient(baseUrl);
      const cookie = await client.login(username.trim(), password);
      const authedClient = new ApiClient(baseUrl, cookie);
      const me = await authedClient.me();
      await onLoggedIn({
        baseUrl,
        cookie,
        user: me.user,
        fullName: me.full_name
      });
    } catch (err) {
      setError(readError(err, "Could not login"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginWrap}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>SNRG</Text>
        </View>
        <Text style={styles.loginTitle}>Gold Coast Field Connect</Text>
        <Text style={styles.loginSubtitle}>Login with your ERPNext credentials.</Text>

        <TextInput
          autoCapitalize="none"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="ERPNext URL"
          style={styles.input}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          value={username}
          onChangeText={setUsername}
          placeholder="Email / username"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable disabled={loading || !username || !password} onPress={login} style={styles.primaryButton}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Login</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function HomeScreen({
  api,
  onCreateQuotation,
  onOpenQuotations
}: {
  api: ApiClient;
  onCreateQuotation: () => void;
  onOpenQuotations: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setSummary(await api.dashboardSummary());
    } catch (err) {
      setError(readError(err, "Could not load dashboard"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={styles.screenTitle}>Home</Text>
      <Pressable onPress={onCreateQuotation} style={styles.createCard}>
        <MaterialCommunityIcons name="file-document-outline" size={32} color="#fff" />
        <View>
          <Text style={styles.createTitle}>Create Quotation</Text>
          <Text style={styles.createSubtitle}>Customer, items, review, save draft.</Text>
        </View>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.grid}>
        <MetricCard label="Drafts" value={summary?.draft_count ?? 0} onPress={onOpenQuotations} />
        <MetricCard label="Submitted" value={summary?.submitted_count ?? 0} onPress={onOpenQuotations} />
        <MetricCard label="Quotation Value" value={formatCurrency(summary?.quotation_value ?? 0)} wide onPress={onOpenQuotations} />
      </View>
    </ScrollView>
  );
}

function QuotationsScreen({
  api,
  onSelect,
  onCreateQuotation
}: {
  api: ApiClient;
  onSelect: (name: string) => void;
  onCreateQuotation: () => void;
}) {
  const [items, setItems] = useState<QuotationListItem[]>(quotationListCache.items);
  const [status, setStatus] = useState<QuotationStatus>(quotationListCache.status);
  const [query, setQuery] = useState(quotationListCache.query);
  const [loading, setLoading] = useState(!quotationListCache.loaded);
  const [error, setError] = useState("");

  async function load(nextStatus = status, nextQuery = query) {
    setLoading(true);
    setError("");
    try {
      const result = await api.myQuotations(nextStatus, nextQuery);
      quotationListCache.items = result;
      quotationListCache.status = nextStatus;
      quotationListCache.query = nextQuery;
      quotationListCache.loaded = true;
      setItems(result);
    } catch (err) {
      setError(readError(err, "Could not load quotations"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (quotationListCache.loaded && quotationListCache.status === status && quotationListCache.query === query) {
      return;
    }
    load(status, query);
  }, [status]);

  return (
    <View style={styles.flex}>
      <Text style={styles.screenTitle}>My Quotations</Text>
      <Pressable onPress={onCreateQuotation} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Create Quotation</Text>
      </Pressable>
      <View style={styles.searchRow}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search quotation/customer" style={[styles.input, styles.searchInput]} />
        <Pressable onPress={() => load(status, query)} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Search</Text>
        </Pressable>
      </View>
      <View style={styles.chipRow}>
        {(["All", "Draft", "Submitted"] as const).map((label) => (
          <Pressable key={label} onPress={() => setStatus(label)} style={[styles.chip, status === label && styles.activeChip]}>
            <Text style={[styles.chipText, status === label && styles.activeChipText]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.name}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(status, query)} />}
        ListEmptyComponent={
          loading ? (
            <Centered>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Loading quotations...</Text>
            </Centered>
          ) : (
            <EmptyState label="No quotations found" />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item.name)} style={styles.quotationCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.quotationNo}>{item.name}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.customerName}>{item.customer_name}</Text>
            <Text style={styles.muted}>{item.transaction_date} • {item.item_count} item{item.item_count === 1 ? "" : "s"}</Text>
            <Text style={styles.amount}>{formatCurrency(item.grand_total)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function QuotationDetailScreen({
  api,
  quotation,
  onBack,
  onEdit,
  onSubmitted
}: {
  api: ApiClient;
  quotation: string;
  onBack: () => void;
  onEdit: (detail: QuotationDetail) => void;
  onSubmitted: () => void;
}) {
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setDetail(await api.quotationDetail(quotation));
    } catch (err) {
      setError(readError(err, "Could not load quotation"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [quotation]);

  async function submitDraft() {
    if (!detail || detail.docstatus !== 0) {
      return;
    }

    Alert.alert(
      "Submit quotation?",
      "Submitting will trigger ERPNext submit flow and your existing WhatsApp process.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          style: "default",
          onPress: async () => {
            setSubmitting(true);
            setError("");
            try {
              const submitted = await api.submitQuotation(detail.name);
              quotationListCache.loaded = false;
              setDetail(submitted);
              onSubmitted();
            } catch (err) {
              setError(readError(err, "Could not submit quotation"));
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  }

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="arrow-left" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {detail ? (
        <>
          <View style={styles.detailHeader}>
            <Text style={styles.quotationNo}>{detail.name}</Text>
            <StatusPill status={detail.status} />
          </View>
          <Text style={styles.screenTitle}>{detail.customer_name}</Text>
          <Text style={styles.amount}>{formatCurrency(detail.grand_total)}</Text>
          <Text style={styles.muted}>Net total {formatCurrency(detail.net_total)} • {detail.item_count} items</Text>
          {detail.docstatus === 0 ? (
            <View style={styles.actionRow}>
              <Pressable onPress={() => onEdit(detail)} style={[styles.secondaryButton, styles.actionButton]}>
                <Text style={styles.secondaryButtonText}>Edit Draft</Text>
              </Pressable>
              <Pressable disabled={submitting} onPress={submitDraft} style={[styles.primaryButton, styles.actionButton]}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Submit</Text>}
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Items</Text>
          {detail.items.map((item) => (
            <View key={`${item.item_code}-${item.qty}`} style={styles.itemRow}>
              <View style={styles.flex}>
                <Text style={styles.itemName}>{item.item_name}</Text>
                <Text style={styles.muted}>{item.item_code} • Qty {item.qty} {item.uom}</Text>
                <Text style={styles.muted}>Rate {formatCurrency(item.rate)} • Discount {item.discount_percentage}%</Text>
              </View>
              <Text style={styles.lineAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function CreateQuotationScreen({
  api,
  initialQuotation,
  onBack,
  onSaved
}: {
  api: ApiClient;
  initialQuotation: QuotationDetail | null;
  onBack: () => void;
  onSaved: (quotation: string) => void;
}) {
  const isEditing = Boolean(initialQuotation);
  const [step, setStep] = useState<1 | 2 | 3>(initialQuotation ? 2 : 1);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(
    initialQuotation
      ? {
          name: initialQuotation.customer,
          customer_name: initialQuotation.customer_name
        }
      : null
  );
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(
    initialQuotation
      ? initialQuotation.items.map((item) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          stock_uom: item.uom,
          item_group: "",
          qty: item.qty
        }))
      : []
  );
  const [preview, setPreview] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<CustomerSearchResult[]>(getRecentCustomers());

  const inputItems: QuotationInputItem[] = draftItems.map((item) => ({
    item_code: item.item_code,
    qty: item.qty
  }));

  async function searchCustomers(nextQuery = customerQuery) {
    setLoading(true);
    setError("");
    try {
      setCustomers(await api.searchCustomers(nextQuery.trim()));
      setCustomersLoaded(true);
    } catch (err) {
      setError(readError(err, "Could not find customers"));
    } finally {
      setLoading(false);
    }
  }

  async function searchItems(nextQuery = itemQuery) {
    const query = nextQuery.trim();
    if (query.length < 2) {
      setItemResults([]);
      setError("Enter at least 2 characters to search items.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setItemResults(await api.searchItems(query));
    } catch (err) {
      setError(readError(err, "Could not find items"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview() {
    if (!selectedCustomer || draftItems.length === 0) {
      return;
    }

    setStep(3);
    setLoading(true);
    setError("");
    try {
      setPreview(await api.previewQuotation(selectedCustomer.name, inputItems));
    } catch (err) {
      setPreview(null);
      setError(readError(err, "Could not calculate pricing"));
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (!selectedCustomer || draftItems.length === 0) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const saved = await api.saveQuotationDraft(selectedCustomer.name, inputItems, initialQuotation?.name);
      onSaved(saved.name);
    } catch (err) {
      setError(readError(err, "Could not save quotation"));
    } finally {
      setLoading(false);
    }
  }

  function selectCustomer(customer: CustomerSearchResult) {
    setSelectedCustomer(customer);
    const nextRecent = [customer, ...recentCustomersCache.filter((row) => row.name !== customer.name)].slice(0, 5);
    recentCustomersCache.splice(0, recentCustomersCache.length, ...nextRecent);
    setRecentCustomers(nextRecent);
  }

  function addItem(item: ItemSearchResult) {
    setDraftItems((current) => {
      const existing = current.find((row) => row.item_code === item.item_code);
      if (existing) {
        return current.map((row) => (row.item_code === item.item_code ? { ...row, qty: row.qty + 1 } : row));
      }
      return [...current, { ...item, qty: 1 }];
    });
    setItemQuery("");
    setItemResults([]);
    setError("");
  }

  function updateQty(itemCode: string, nextQty: number) {
    const qty = Math.max(1, Math.floor(nextQty || 1));
    setDraftItems((current) => current.map((row) => (row.item_code === itemCode ? { ...row, qty } : row)));
  }

  function removeItem(itemCode: string) {
    setDraftItems((current) => current.filter((row) => row.item_code !== itemCode));
  }

  useEffect(() => {
    if (step === 1 && !customersLoaded) {
      searchCustomers("");
    }
  }, [step, customersLoaded]);

  function loadCustomerPicker() {
    if (!customerQuery.trim()) {
      searchCustomers("");
    }
  }

  useEffect(() => {
    if (step !== 1) {
      return;
    }

    const query = customerQuery.trim();
    if (!query || query.length < 2) {
      return;
    }

    const timeout = setTimeout(() => {
      searchCustomers(query);
    }, 350);

    return () => clearTimeout(timeout);
  }, [step, customerQuery]);

  useEffect(() => {
    if (step !== 2) {
      return;
    }

    const query = itemQuery.trim();
    if (query.length < 2) {
      return;
    }

    const timeout = setTimeout(() => {
      searchItems(query);
    }, 350);

    return () => clearTimeout(timeout);
  }, [step, itemQuery]);

  return (
    <View style={styles.flex}>
      <View style={styles.rowBetween}>
        <Pressable onPress={step === 1 || (isEditing && step === 2) ? onBack : () => setStep((step - 1) as 1 | 2)} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={colors.primary} />
          <Text style={styles.backText}>{step === 1 || (isEditing && step === 2) ? "Close" : "Back"}</Text>
        </Pressable>
        <Text style={styles.stepText}>Step {step} of 3</Text>
      </View>

      <Text style={styles.screenTitle}>{isEditing ? `Edit ${initialQuotation?.name}` : "Create Quotation"}</Text>
      <View style={styles.stepBar}>
        <View style={[styles.stepDot, step >= 1 && styles.activeStepDot]} />
        <View style={[styles.stepLine, step >= 2 && styles.activeStepLine]} />
        <View style={[styles.stepDot, step >= 2 && styles.activeStepDot]} />
        <View style={[styles.stepLine, step >= 3 && styles.activeStepLine]} />
        <View style={[styles.stepDot, step >= 3 && styles.activeStepDot]} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {step === 1 ? (
        <View style={styles.flex}>
          <Text style={styles.sectionTitleNoTop}>Select Customer</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={customerQuery}
              onChangeText={setCustomerQuery}
              onFocus={loadCustomerPicker}
              placeholder="Customer name, code, mobile"
              style={[styles.input, styles.searchInput]}
            />
            <Pressable onPress={() => searchCustomers()} style={styles.smallButton}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.smallButtonText}>Search</Text>}
            </Pressable>
          </View>
          {selectedCustomer ? (
            <View style={styles.selectedCustomerBox}>
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.success} />
              <View style={styles.flex}>
                <Text style={styles.labelNoTop}>Selected Customer</Text>
                <Text style={styles.customerNameTight}>{selectedCustomer.customer_name}</Text>
                <Text style={styles.muted}>{selectedCustomer.name} {selectedCustomer.territory ? `• ${selectedCustomer.territory}` : ""}</Text>
              </View>
            </View>
          ) : null}
          {!customerQuery.trim() && recentCustomers.length ? (
            <View style={styles.recentBlock}>
              <Text style={styles.labelNoTop}>Recent Customers</Text>
              {recentCustomers.map((item) => (
                <Pressable
                  key={item.name}
                  onPress={() => selectCustomer(item)}
                  style={[styles.resultCard, selectedCustomer?.name === item.name && styles.selectedResultCard]}
                >
                  <View style={styles.rowBetween}>
                    <View style={styles.flex}>
                      <Text style={styles.customerNameTight}>{item.customer_name}</Text>
                      <Text style={styles.muted}>{item.name} {item.territory ? `• ${item.territory}` : ""}</Text>
                    </View>
                    {selectedCustomer?.name === item.name ? <MaterialCommunityIcons name="check" size={20} color={colors.success} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FlatList
            data={customers}
            keyExtractor={(item) => item.name}
            ListEmptyComponent={!loading ? <EmptyState label="No assigned customers found" /> : null}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => selectCustomer(item)}
                style={[styles.resultCard, selectedCustomer?.name === item.name && styles.selectedResultCard]}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={styles.customerNameTight}>{item.customer_name}</Text>
                    <Text style={styles.muted}>{item.name} {item.territory ? `• ${item.territory}` : ""}</Text>
                    {item.mobile_no ? <Text style={styles.muted}>{item.mobile_no}</Text> : null}
                  </View>
                  {selectedCustomer?.name === item.name ? <MaterialCommunityIcons name="check" size={20} color={colors.success} /> : null}
                </View>
              </Pressable>
            )}
          />
          <Pressable disabled={!selectedCustomer} onPress={() => setStep(2)} style={[styles.primaryButton, !selectedCustomer && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : step === 2 ? (
        <View style={styles.flex}>
          <Text style={styles.sectionTitleNoTop}>Add Items</Text>
          <View style={styles.selectedBox}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{selectedCustomer?.customer_name}</Text>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              value={itemQuery}
              onChangeText={setItemQuery}
              placeholder="Item name or code"
              style={[styles.input, styles.searchInput]}
            />
            <Pressable onPress={() => searchItems()} style={styles.smallButton}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.smallButtonText}>Search</Text>}
            </Pressable>
          </View>
          <ScrollView style={styles.flex}>
            {draftItems.length ? (
              <>
                <Text style={styles.label}>Selected Items</Text>
                {draftItems.map((item) => (
                  <View key={item.item_code} style={styles.selectedItemCard}>
                    <View>
                      <Text style={styles.itemName}>{item.item_name}</Text>
                      <Text style={styles.muted}>{item.item_code} • {item.stock_uom}</Text>
                    </View>
                    <View style={styles.itemEditRow}>
                      <View style={styles.qtyWrap}>
                        <Text style={styles.qtyLabel}>Qty</Text>
                        <TextInput
                          keyboardType="number-pad"
                          value={String(item.qty)}
                          onChangeText={(value) => updateQty(item.item_code, Number(value))}
                          style={styles.qtyInput}
                        />
                      </View>
                      <Pressable onPress={() => removeItem(item.item_code)} style={styles.removeItemButton}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                        <Text style={styles.removeItemText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={styles.label}>Search Results</Text>
            {itemResults.map((item) => (
              <View key={item.item_code} style={styles.itemResultCard}>
                <View style={styles.flex}>
                  <Text style={styles.itemName}>{item.item_name}</Text>
                  <Text style={styles.muted}>{item.item_code} • {item.stock_uom} • {item.item_group}</Text>
                </View>
                <Pressable onPress={() => addItem(item)} style={styles.addItemButton}>
                  <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  <Text style={styles.addItemText}>Add</Text>
                </Pressable>
              </View>
            ))}
            {!itemResults.length && !loading ? <EmptyState label="Search allowed items" /> : null}
          </ScrollView>
          <Pressable disabled={!draftItems.length} onPress={loadPreview} style={[styles.primaryButton, !draftItems.length && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>Review Pricing</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView>
          <Text style={styles.sectionTitleNoTop}>Review</Text>
          <View style={styles.selectedBox}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{selectedCustomer?.customer_name}</Text>
          </View>
          {loading ? (
            <Centered>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Calculating ERPNext pricing...</Text>
            </Centered>
          ) : preview ? (
            <>
              <Text style={styles.amount}>{formatCurrency(preview.grand_total)}</Text>
              <Text style={styles.muted}>Net total {formatCurrency(preview.net_total)} • {preview.item_count} items</Text>
              <Text style={styles.sectionTitle}>Items</Text>
              {preview.items.map((item) => (
                <View key={`${item.item_code}-${item.qty}`} style={styles.itemRow}>
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    <Text style={styles.muted}>{item.item_code} • Qty {item.qty} {item.uom}</Text>
                    <Text style={styles.muted}>Rate {formatCurrency(item.rate)} • Discount {item.discount_percentage}%</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatCurrency(item.amount)}</Text>
                </View>
              ))}
              <Pressable onPress={loadPreview} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Refresh Pricing</Text>
              </Pressable>
              <Pressable onPress={saveDraft} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{isEditing ? "Update Draft" : "Save Draft"}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={loadPreview} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ProfileScreen({ api, onLogout }: { api: ApiClient; onLogout: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.me().then(setMe).catch((err) => setError(readError(err, "Could not load profile")));
  }, []);

  return (
    <ScrollView>
      <Text style={styles.screenTitle}>Profile</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.profileCard}>
        <Text style={styles.customerName}>{me?.full_name || "Sales User"}</Text>
        <Text style={styles.muted}>{me?.user}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Employee</Text>
        <Text style={styles.value}>{me?.employee_name} ({me?.employee})</Text>
        <Text style={styles.label}>Sales Person</Text>
        <Text style={styles.value}>{me?.sales_person_name}</Text>
        <Text style={styles.label}>Access</Text>
        <Text style={styles.value}>{me?.has_sales_app_access ? "Sales App User" : "No access"}</Text>
      </View>
      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </ScrollView>
  );
}

function BottomTabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
    { id: "home", label: "Home", icon: "home-outline" },
    { id: "quotations", label: "Quotations", icon: "file-document-outline" },
    { id: "profile", label: "Profile", icon: "account-outline" }
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.tabButton}>
          <MaterialCommunityIcons name={tab.icon} size={24} color={active === tab.id ? colors.primary : colors.muted} />
          <Text style={[styles.tabText, active === tab.id && styles.activeTabText]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MetricCard({ label, value, wide, onPress }: { label: string; value: string | number; wide?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.metricCard, wide && styles.wideCard]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: string }) {
  const submitted = status === "Submitted";
  return (
    <View style={[styles.statusPill, submitted ? styles.submittedPill : styles.draftPill]}>
      <Text style={[styles.statusText, submitted ? styles.submittedText : styles.draftText]}>{status}</Text>
    </View>
  );
}

function ScreenShell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell}>{children}</SafeAreaView>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function readError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return `${error.title}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

const colors = {
  primary: "#0D3B66",
  accent: "#D7A642",
  background: "#F5F7FA",
  card: "#FFFFFF",
  text: "#1F2933",
  muted: "#6B7280",
  border: "#E2E8F0",
  danger: "#B42318",
  success: "#067647"
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background
  },
  flex: {
    flex: 1
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  appHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  brandLogo: {
    minWidth: 116,
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  brandLogoMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.accent,
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 24
  },
  brandLogoTitle: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  brandLogoSubtitle: {
    color: colors.accent,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5
  },
  brandCopy: {
    flex: 1
  },
  brandEyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700"
  },
  brandTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800"
  },
  content: {
    flex: 1,
    padding: 16
  },
  screenTitle: {
    fontSize: 24,
    color: colors.text,
    fontWeight: "800",
    marginBottom: 14
  },
  muted: {
    color: colors.muted,
    fontSize: 13
  },
  loginWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18
  },
  logoText: {
    color: "#fff",
    fontWeight: "800"
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text
  },
  loginSubtitle: {
    color: colors.muted,
    marginTop: 6,
    marginBottom: 24
  },
  input: {
    minHeight: 50,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    marginBottom: 12,
    color: colors.text
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  disabledButton: {
    opacity: 0.45
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 16
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  actionButton: {
    flex: 1,
    marginTop: 0
  },
  errorText: {
    color: colors.danger,
    marginBottom: 12,
    lineHeight: 20
  },
  createCard: {
    minHeight: 112,
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14
  },
  createTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800"
  },
  createSubtitle: {
    color: "#EAF2F8",
    marginTop: 4
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  metricCard: {
    width: "48%",
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  wideCard: {
    width: "100%"
  },
  metricLabel: {
    color: colors.muted,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8
  },
  searchRow: {
    flexDirection: "row",
    gap: 8
  },
  searchInput: {
    flex: 1
  },
  smallButton: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  smallButtonText: {
    color: "#fff",
    fontWeight: "800"
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  activeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
    fontWeight: "700"
  },
  activeChipText: {
    color: "#fff"
  },
  quotationCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  quotationNo: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 15
  },
  customerName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
    marginTop: 8
  },
  customerNameTight: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginTop: 3
  },
  amount: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  draftPill: {
    backgroundColor: "#FFF4E5"
  },
  submittedPill: {
    backgroundColor: "#E7F8EF"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800"
  },
  draftText: {
    color: "#B54708"
  },
  submittedText: {
    color: colors.success
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14
  },
  backText: {
    color: colors.primary,
    fontWeight: "800"
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 22,
    marginBottom: 10
  },
  sectionTitleNoTop: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10
  },
  stepText: {
    color: colors.muted,
    fontWeight: "800"
  },
  stepBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border
  },
  activeStepDot: {
    backgroundColor: colors.primary
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border
  },
  activeStepLine: {
    backgroundColor: colors.primary
  },
  selectedBox: {
    backgroundColor: "#EEF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CFE7FF",
    padding: 12,
    marginBottom: 12
  },
  selectedCustomerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ECFDF3",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ABEFC6",
    padding: 12,
    marginBottom: 12
  },
  recentBlock: {
    marginBottom: 8
  },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8
  },
  selectedResultCard: {
    borderColor: colors.success,
    backgroundColor: "#F0FDF4"
  },
  selectedItemCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8
  },
  itemEditRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    paddingLeft: 12
  },
  qtyLabel: {
    color: colors.muted,
    fontWeight: "800",
    marginRight: 8
  },
  qtyInput: {
    width: 96,
    height: 44,
    textAlign: "right",
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    fontSize: 17,
    fontWeight: "800"
  },
  removeItemButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF3F2"
  },
  removeItemText: {
    color: colors.danger,
    fontWeight: "800"
  },
  itemResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8
  },
  addItemButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  addItemText: {
    color: "#fff",
    fontWeight: "800"
  },
  itemRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8
  },
  itemName: {
    color: colors.text,
    fontWeight: "800"
  },
  lineAmount: {
    color: colors.text,
    fontWeight: "800"
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  label: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 12
  },
  labelNoTop: {
    color: colors.muted,
    fontWeight: "700"
  },
  value: {
    color: colors.text,
    fontWeight: "700",
    marginTop: 3
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 16,
    marginBottom: 4
  },
  logoutButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "800"
  },
  emptyState: {
    padding: 24,
    alignItems: "center"
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingTop: 8,
    paddingBottom: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  activeTabText: {
    color: colors.primary
  }
});
