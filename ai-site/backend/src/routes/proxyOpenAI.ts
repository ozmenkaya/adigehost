import { Router } from "express";
import { Reservation } from "../models/Reservation";
import { Resource } from "../models/Resource";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { reservationFromRequest, assertReservationAllowsModel } from "../security/reservationAuth";
import { chatCompletion, listModels } from "../services/LlmApiService";

const router = Router();

router.post(
  "/chat/completions",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);

    if (reservation.resourceId === null) throw new ApiError(400, "Bu bir gateway rezervasyonu, /api/proxy/gateway kullanın");

    const resource = await Resource.findOne({
      where: { id: reservation.resourceId, type: "llm_api", status: "active" },
    });
    if (!resource) throw new ApiError(404, "Kaynak bulunamadı veya pasif");

    const availableModels = await listModels(resource);
    const requestedModel = typeof req.body?.model === "string" && req.body.model.trim() ? req.body.model.trim() : null;
    if (requestedModel && !availableModels.includes(requestedModel)) {
      throw new ApiError(400, `Model bu kaynak için kullanılamıyor: ${requestedModel}`);
    }
    const model = requestedModel ?? availableModels[0] ?? null;
    if (!model) throw new ApiError(502, "Kaynak için kullanılabilir model bulunamadı");
    assertReservationAllowsModel(reservation, model);

    const { model: _ignored, ...bodyRest } = req.body ?? {};
    const { status, data } = await chatCompletion(resource, model, bodyRest);
    const usage = (data as { usage?: { total_tokens?: number } })?.usage;

    const usedTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : 0;
    if (usedTokens > 0) {
      await Reservation.increment("tokensUsed", { by: usedTokens, where: { id: reservation.id } });
    }
    if (reservation.status === "scheduled") {
      reservation.status = "active";
      await reservation.save();
    }

    res.status(status).json(data);
  }),
);

router.get(
  "/quota",
  asyncHandler(async (req, res) => {
    const reservation = await reservationFromRequest(req);

    res.json({
      status: reservation.status,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      tokensUsed: reservation.tokensUsed,
    });
  }),
);

export default router;
