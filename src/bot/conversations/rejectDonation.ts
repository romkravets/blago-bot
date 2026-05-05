import { prisma } from "../../db/client";
import { MyContext, MyConversation } from "../../types";
import { logger } from "../middlewares/logger";

export async function rejectDonationConversation(
  conversation: MyConversation,
  ctx: MyContext,
): Promise<void> {
  const donationId = ctx.session.pendingRejectionDonationId;
  if (!donationId) return;

  await ctx.reply("Вкажіть причину відмови (юзер її побачить):");

  const reasonCtx = await conversation.waitFor("message:text");
  const reason = reasonCtx.message.text;

  const donation = await conversation.external(() =>
    prisma.donation.findUnique({
      where: { id: donationId },
      include: { user: true },
    }),
  );

  if (!donation || donation.status !== "PENDING") {
    await ctx.reply("⚠️ Цей донат вже оброблено.");
    ctx.session.pendingRejectionDonationId = undefined;
    return;
  }

  await conversation.external(async () => {
    await prisma.donation.update({
      where: { id: donationId },
      data: { status: "REJECTED" },
    });

    await prisma.auditLog.create({
      data: {
        donationId,
        action: "REJECTED",
        actor: `admin:${ctx.from!.id}`,
        meta: JSON.stringify({ reason, adminUsername: ctx.from!.username }),
      },
    });
  });

  ctx.session.pendingRejectionDonationId = undefined;

  try {
    await ctx.api.sendMessage(
      Number(donation.user.telegramId),
      `❌ На жаль, ваш запит не підтверджено.\n\nПричина: ${reason}\n\nЯкщо ви вважаєте це помилкою — зверніться до організатора напряму.`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to notify user about rejection");
  }

  await ctx.reply("✅ Донат відхилено. Юзера повідомлено.");
  logger.info(
    { donationId, reason, adminId: ctx.from!.id },
    "Donation rejected",
  );
}
