import {
  ADVANCE_THRESHOLD_PAISE,
  type FormFieldDefinition,
  type PricingRuleDefinition,
} from "./service-schema";

export interface PricingLineItem {
  ruleId: string;
  label: string;
  type: "base" | PricingRuleDefinition["type"];
  fieldKey: string | null;
  quantity: number;
  unitAmountPaise: number;
  amountPaise: number;
}

export interface CalculateRequestPricingInput {
  basePricePaise: number;
  formSchema: FormFieldDefinition[];
  pricingRules: PricingRuleDefinition[];
  formData: Record<string, unknown>;
}

export interface PricingBreakdown {
  lineItems: PricingLineItem[];
  basePricePaise: number;
  totalAmountPaise: number;
  requiresAdvance: boolean;
  advanceRequiredPaise: number;
  remainingBalancePaise: number;
}

function readNumericFieldValue(raw: unknown, fieldKey: string): number {
  if (raw === undefined || raw === null || raw === "") {
    return 0;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RangeError(
      `Pricing field "${fieldKey}" must have a non-negative finite number`
    );
  }

  return parsed;
}

/**
 * Computes backend-authoritative pricing and 50% advance split-payment amounts in integer paise.
 */
export function calculateRequestPricing({
  basePricePaise,
  formSchema,
  pricingRules,
  formData,
}: CalculateRequestPricingInput): PricingBreakdown {
  if (!Number.isInteger(basePricePaise) || basePricePaise < 0) {
    throw new RangeError("basePricePaise must be a non-negative integer");
  }

  const fieldByKey = new Map<string, FormFieldDefinition>();
  for (const field of formSchema) {
    fieldByKey.set(field.key, field);
  }

  const lineItems: PricingLineItem[] = [
    {
      ruleId: "base",
      label: "Base Service Charge",
      type: "base",
      fieldKey: null,
      quantity: 1,
      unitAmountPaise: basePricePaise,
      amountPaise: basePricePaise,
    },
  ];

  let totalAmountPaise = basePricePaise;

  for (const rule of pricingRules) {
    const targetField = fieldByKey.get(rule.fieldKey);
    if (!targetField) {
      throw new Error(
        `Pricing rule "${rule.id}" references unknown field "${rule.fieldKey}"`
      );
    }

    const rawValue = Object.hasOwn(formData, rule.fieldKey)
      ? formData[rule.fieldKey]
      : undefined;

    switch (rule.type) {
      case "per_unit": {
        if (targetField.type !== "number") {
          throw new Error(
            `per_unit rule "${rule.id}" requires a number field, got "${targetField.type}"`
          );
        }
        const quantity = readNumericFieldValue(rawValue, rule.fieldKey);
        const amountPaise = Math.round(quantity * rule.unitPricePaise);
        if (amountPaise > 0) {
          lineItems.push({
            ruleId: rule.id,
            label: rule.label,
            type: rule.type,
            fieldKey: rule.fieldKey,
            quantity,
            unitAmountPaise: rule.unitPricePaise,
            amountPaise,
          });
          totalAmountPaise += amountPaise;
        }
        break;
      }

      case "option_surcharge": {
        if (targetField.type !== "select") {
          throw new Error(
            `option_surcharge rule "${rule.id}" requires a select field, got "${targetField.type}"`
          );
        }
        if (
          typeof rawValue === "string" &&
          Object.hasOwn(rule.optionSurchargesPaise, rawValue)
        ) {
          const surcharge = rule.optionSurchargesPaise[rawValue];
          if (surcharge > 0) {
            lineItems.push({
              ruleId: rule.id,
              label: `${rule.label} (${rawValue})`,
              type: rule.type,
              fieldKey: rule.fieldKey,
              quantity: 1,
              unitAmountPaise: surcharge,
              amountPaise: surcharge,
            });
            totalAmountPaise += surcharge;
          }
        }
        break;
      }

      case "boolean_surcharge": {
        if (targetField.type !== "checkbox") {
          throw new Error(
            `boolean_surcharge rule "${rule.id}" requires a checkbox field, got "${targetField.type}"`
          );
        }
        if (rawValue === true && rule.surchargePaise > 0) {
          lineItems.push({
            ruleId: rule.id,
            label: rule.label,
            type: rule.type,
            fieldKey: rule.fieldKey,
            quantity: 1,
            unitAmountPaise: rule.surchargePaise,
            amountPaise: rule.surchargePaise,
          });
          totalAmountPaise += rule.surchargePaise;
        }
        break;
      }
    }
  }

  const requiresAdvance = totalAmountPaise >= ADVANCE_THRESHOLD_PAISE;
  const advanceRequiredPaise = requiresAdvance
    ? Math.ceil(totalAmountPaise / 2)
    : 0;
  const remainingBalancePaise = totalAmountPaise - advanceRequiredPaise;

  return {
    lineItems,
    basePricePaise,
    totalAmountPaise,
    requiresAdvance,
    advanceRequiredPaise,
    remainingBalancePaise,
  };
}
