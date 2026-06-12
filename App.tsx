import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  DashboardSummary,
  MeResponse,
  QuotationDetail,
  QuotationListItem
} from "./src/lib/types";

type Tab = "home" | "quotations" | "profile";

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

  return (
    <ScreenShell>
      <StatusBar style="dark" />
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.brandEyebrow}>Gold Coast</Text>
          <Text style={styles.brandTitle}>Field Connect</Text>
        </View>
      </View>

      <View style={styles.content}>
        {selectedQuotation ? (
          <QuotationDetailScreen
            api={api}
            quotation={selectedQuotation}
            onBack={() => setSelectedQuotation(null)}
          />
        ) : tab === "home" ? (
          <HomeScreen api={api} onOpenQuotations={() => setTab("quotations")} />
        ) : tab === "quotations" ? (
          <QuotationsScreen api={api} onSelect={setSelectedQuotation} />
        ) : (
          <ProfileScreen api={api} onLogout={onLogout} />
        )}
      </View>

      {!selectedQuotation && <BottomTabs active={tab} onChange={setTab} />}
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

function HomeScreen({ api, onOpenQuotations }: { api: ApiClient; onOpenQuotations: () => void }) {
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
      <Pressable style={styles.createCard}>
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

function QuotationsScreen({ api, onSelect }: { api: ApiClient; onSelect: (name: string) => void }) {
  const [items, setItems] = useState<QuotationListItem[]>([]);
  const [status, setStatus] = useState<"All" | "Draft" | "Submitted">("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const result = await api.myQuotations(status, query);
      setItems(result);
    } catch (err) {
      setError(readError(err, "Could not load quotations"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  return (
    <View style={styles.flex}>
      <Text style={styles.screenTitle}>My Quotations</Text>
      <View style={styles.searchRow}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search quotation/customer" style={[styles.input, styles.searchInput]} />
        <Pressable onPress={load} style={styles.smallButton}>
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <EmptyState label="No quotations found" /> : null}
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

function QuotationDetailScreen({ api, quotation, onBack }: { api: ApiClient; quotation: string; onBack: () => void }) {
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
    backgroundColor: colors.card
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
