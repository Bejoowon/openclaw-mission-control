"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

import { GatewaysTable } from "@/components/gateways/GatewaysTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

import { ApiError } from "@/api/mutator";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  getListGatewaysApiV1GatewaysGetQueryKey,
  useDeleteGatewayApiV1GatewaysGatewayIdDelete,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type { GatewayRead } from "@/api/generated/model";
import { useUrlSorting } from "@/lib/use-url-sorting";

const GATEWAY_SORTABLE_COLUMNS = ["name", "workspace_root", "updated_at"];

export default function GatewaysPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: GATEWAY_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "gateways",
  });

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [deleteTarget, setDeleteTarget] = useState<GatewayRead | null>(null);

  const gatewaysKey = getListGatewaysApiV1GatewaysGetQueryKey();
  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [],
    [gatewaysQuery.data],
  );

  const deleteMutation = useDeleteGatewayApiV1GatewaysGatewayIdDelete<
    ApiError,
    { previous?: listGatewaysApiV1GatewaysGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        GatewayRead,
        listGatewaysApiV1GatewaysGetResponse,
        { gatewayId: string }
      >({
        queryClient,
        queryKey: gatewaysKey,
        getItemId: (gateway) => gateway.id,
        getDeleteId: ({ gatewayId }) => gatewayId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [gatewaysKey],
      }),
    },
    queryClient,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ gatewayId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "게이트웨이를 보려면 로그인해 주세요.",
          forceRedirectUrl: "/gateways",
        }}
        title="게이트웨이"
        description="보드에서 사용하는 OpenClaw 게이트웨이 연결을 관리해요"
        headerActions={
          isAdmin && gateways.length > 0 ? (
            <Link
              href="/gateways/new"
              className={buttonVariants({
                size: "md",
                variant: "primary",
              })}
            >
              게이트웨이 생성
            </Link>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage="조직 소유자/관리자만 게이트웨이 페이지에 접근할 수 있어요."
        stickyHeader
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <GatewaysTable
            gateways={gateways}
            isLoading={gatewaysQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onDelete={setDeleteTarget}
            emptyState={{
              title: "No gateways yet",
              description:
                "Create your first gateway to connect boards and start managing your OpenClaw connections.",
              actionHref: "/gateways/new",
              actionLabel: "Create your first gateway",
            }}
          />
        </div>

        {gatewaysQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {gatewaysQuery.error.message}
          </p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete gateway?"
        description={
          <>
            This removes the gateway connection from Mission Control. Boards
            using it will need a new gateway assigned.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        errorStyle="text"
        cancelVariant="ghost"
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
