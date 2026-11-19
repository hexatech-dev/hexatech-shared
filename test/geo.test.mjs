import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMapsUrl, buildPlaceShortName, isValidGeoPoint } from "../dist/geo.js";

describe("isValidGeoPoint", () => {
  it("accepts in-range coordinates", () => {
    assert.equal(isValidGeoPoint({ lat: 19.07, lng: 72.87 }), true);
    assert.equal(isValidGeoPoint({ lat: -90, lng: 180 }), true);
  });

  it("rejects out-of-range, non-finite or malformed values", () => {
    assert.equal(isValidGeoPoint({ lat: 91, lng: 0 }), false);
    assert.equal(isValidGeoPoint({ lat: 0, lng: -181 }), false);
    assert.equal(isValidGeoPoint({ lat: Number.NaN, lng: 0 }), false);
    assert.equal(isValidGeoPoint({ lat: "19", lng: 72 }), false);
    assert.equal(isValidGeoPoint(null), false);
  });
});

describe("buildPlaceShortName", () => {
  it("joins name, locality, city and state", () => {
    assert.equal(
      buildPlaceShortName({
        name: "Shivaji Park",
        address: {
          suburb: "Dadar",
          city: "Mumbai",
          state: "Maharashtra",
          postcode: "400028",
          country: "India",
        },
        displayName: "Shivaji Park, Dadar, Mumbai, ..., India",
      }),
      "Shivaji Park, Dadar, Mumbai, Maharashtra",
    );
  });

  it("falls back through locality/city alternatives and dedupes", () => {
    assert.equal(
      buildPlaceShortName({
        name: "",
        address: { road: "MG Road", village: "Kothrud", town: "Kothrud", state: "Maharashtra" },
        displayName: "x",
      }),
      "MG Road, Kothrud, Maharashtra",
    );
  });

  it("uses displayName when nothing usable exists", () => {
    assert.equal(
      buildPlaceShortName({ address: {}, displayName: "  Somewhere  " }),
      "Somewhere",
    );
  });
});

describe("buildMapsUrl", () => {
  it("encodes coordinates", () => {
    assert.equal(
      buildMapsUrl({ lat: 19.0759837, lng: 72.8776559 }),
      "https://www.google.com/maps/search/?api=1&query=19.075984%2C72.877656",
    );
  });

  it("encodes an address", () => {
    assert.equal(
      buildMapsUrl(" Shivaji Park, Mumbai "),
      "https://www.google.com/maps/search/?api=1&query=Shivaji%20Park%2C%20Mumbai",
    );
  });
});
