import { inspect } from "node:util";
import validation from "@cyclonedx/cyclonedx-library/Validation";
import spec from "@cyclonedx/cyclonedx-library/Spec";

const { JsonStrictValidator } = validation;
const { Version } = spec;

export async function validateReleaseSbom(sbom) {
  if (!sbom || typeof sbom !== "object" || Array.isArray(sbom)) {
    throw new TypeError("The final release SBOM must be a JSON object");
  }
  if (!Object.values(Version).includes(sbom.specVersion)) {
    throw new Error(`Unsupported CycloneDX specification version: ${sbom.specVersion || "missing"}`);
  }

  const validationError = await new JsonStrictValidator(sbom.specVersion)
    .validate(JSON.stringify(sbom));
  if (validationError !== null) {
    throw new Error(`Final CycloneDX SBOM validation failed: ${inspect(validationError, {
      breakLength: Infinity,
      depth: 8,
    })}`);
  }
  return sbom;
}
