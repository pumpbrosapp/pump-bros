import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

// The three statuses this screen lets an admin move a report between.
// The reports table's check constraint also allows 'dismissed', but
// that's not part of what this screen exposes.
const STATUS_OPTIONS: ReportStatus[] = ['pending', 'reviewed', 'resolved'];

interface ReportProfileRef {
  id: string;
  username: string | null;
  display_name: string | null;
}

interface ReportRow {
  id: string;
  reason: string;
  status: ReportStatus;
  content_type: 'message' | 'group_message' | null;
  content_id: string | null;
  created_at: string;
  // PostgREST embeds a single related row as an object here (not an
  // array) since reporter_id/reported_user_id are each a single FK, not
  // a one-to-many relationship.
  reporter: ReportProfileRef | null;
  reported: ReportProfileRef | null;
}

function profileLabel(profile: ReportProfileRef | null): string {
  if (!profile) return 'Unknown user';
  return profile.display_name || (profile.username ? `@${profile.username}` : 'Unknown user');
}

function contentLabel(contentType: ReportRow['content_type']): string {
  if (contentType === 'message') return 'Reported a DM';
  if (contentType === 'group_message') return 'Reported a group message';
  return 'Reported the profile';
}

function statusColor(status: ReportStatus): string {
  switch (status) {
    case 'pending':
      return '#E0483E';
    case 'reviewed':
      return '#D8A11B';
    case 'resolved':
      return '#3FA35A';
    default:
      return colors.textTertiary;
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminReportsScreen({ visible, onClose }: Props) {
  const { user } = useAuth();
  // Belt-and-suspenders: the entry point in ProfileScreen already only
  // shows up for admins, but this guard means the screen renders
  // nothing even if it were somehow opened another way. The real
  // enforcement — what data can actually be read or changed — lives in
  // the reports table's RLS policies (see supabase/schema.sql), not
  // here; a client-side check can't be trusted on its own.
  const isAdmin = !!user?.isAdmin;

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (!isSupabaseConfigured || !isAdmin) {
      setReports([]);
      return;
    }
    const { data, error } = await supabase
      .from('reports')
      .select(
        'id, reason, status, content_type, content_id, created_at, reporter:reporter_id (id, username, display_name), reported:reported_user_id (id, username, display_name)'
      )
      .order('created_at', { ascending: false });
    if (error || !data) {
      setReports([]);
      return;
    }
    setReports(data as unknown as ReportRow[]);
  }, [isAdmin]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchReports().finally(() => setLoading(false));
  }, [visible, fetchReports]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  }, [fetchReports]);

  const runStatusChange = useCallback(
    async (reportId: string, nextStatus: ReportStatus) => {
      const previous = reports;
      setUpdatingId(reportId);
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: nextStatus } : r)));
      const { error } = await supabase.from('reports').update({ status: nextStatus }).eq('id', reportId);
      setUpdatingId(null);
      if (error) {
        // Revert the optimistic update — this covers both a real
        // failure and a non-admin somehow reaching this code path,
        // since RLS silently matches zero rows rather than erroring for
        // the latter, but there's no harm in handling it the same way
        // either way.
        setReports(previous);
        Alert.alert("Couldn't update report", 'Check your connection and try again.');
      }
    },
    [reports]
  );

  const handleChangeStatus = useCallback(
    (report: ReportRow) => {
      const options = STATUS_OPTIONS.filter((status) => status !== report.status);
      Alert.alert(
        'Change status',
        `Reported: ${profileLabel(report.reported)}`,
        [
          ...options.map((status) => ({
            text: status.charAt(0).toUpperCase() + status.slice(1),
            onPress: () => runStatusChange(report.id, status),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    },
    [runStatusChange]
  );

  if (!isAdmin) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reports</Text>
            <View style={styles.headerBtn} />
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          ) : (
            <FlatList
              data={reports}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="flag-outline" size={24} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>No reports yet.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => handleChangeStatus(item)}
                  disabled={updatingId === item.id}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.reportedName} numberOfLines={1}>
                      {profileLabel(item.reported)}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
                      <Text style={styles.statusPillText}>{item.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.reasonText}>{item.reason}</Text>
                  <Text style={styles.metaText}>
                    {contentLabel(item.content_type)} · reported by {profileLabel(item.reporter)}
                  </Text>
                  <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 4,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reportedName: {
    flex: 1,
    fontSize: type.body,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  reasonText: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  metaText: {
    fontSize: type.label,
    color: colors.textSecondary,
  },
  dateText: {
    fontSize: type.label,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
