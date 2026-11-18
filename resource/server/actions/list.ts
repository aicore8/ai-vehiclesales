import {
  aiLog,
  online,
  vehicleCondition,
  vehicleKeys,
} from "@aicore8/lib/server";
import { fail } from "@aicore8/lib/shared";
import { settings } from "../content";
import { listings } from "../listings/listings";
import { drivenAtSellSpot, sellLock } from "../sellSpot";
import { HOLD, vehiclesApi } from "../vehicles";

/** Lists the vehicle the player drives at the lot's sell spot. */
export function listVehicle(
  source: number,
  lotId: string,
  netId: number,
  price: number,
  description: string,
) {
  return sellLock.run(source, fail("ERR_PENDING"), async () => {
    const driven = drivenAtSellSpot(source, lotId, netId);
    if (typeof driven === "string") return fail(driven);
    const { lot, character, vehicleId, vehicle } = driven;
    const { minPrice, maxPrice, maxListings } = settings.value;
    if (price < minPrice || price > maxPrice) return fail("ERR_PRICE");
    if (listings.countOf(character.id) >= maxListings) return fail("ERR_LIMIT");
    if (listings.ofVehicle(vehicleId)) return fail("ERR_LISTED");
    const listing = await listings.create({
      vehicleId,
      lot: lot.id,
      seller: character.id,
      sellerName: online.name(source),
      model: vehicle.model,
      plate: vehicle.plate,
      price,
      description,
    });
    if (!listing) return fail("ERR_FAILED");
    // The vehicle may have left the spot or changed hands during the insert.
    const still = drivenAtSellSpot(source, lotId, netId);
    if (typeof still === "string" || still.vehicleId !== vehicleId) {
      await listings.discard(listing);
      return fail(typeof still === "string" ? still : "ERR_FAILED");
    }
    const { entity } = still;
    // The condition is the server's (lib `vehicleCondition`: fuel layer, damage on Enhanced); the stored look stays.
    vehiclesApi.SaveVehicle(vehicleId, vehicleCondition(entity));
    vehiclesApi.StoreVehicle(vehicleId, null, "garage");
    vehiclesApi.SetOwner(vehicleId, HOLD);
    vehicleKeys.remove(source, vehicle.plate);
    listings.add(listing);
    aiLog("listings", `listed ${vehicle.plate} for $${price} at ${lot.id}`, {
      source,
      metadata: {
        plate: vehicle.plate,
        model: vehicle.model,
        price,
        lot: lot.id,
      },
    });
    return { ok: true };
  });
}
