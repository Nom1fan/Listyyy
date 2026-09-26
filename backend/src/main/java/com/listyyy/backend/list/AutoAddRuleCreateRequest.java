package com.listyyy.backend.list;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.UUID;

/** Create body for a list-level automatic replenishment rule. */
@Data
@EqualsAndHashCode(callSuper = true)
public class AutoAddRuleCreateRequest extends AutoAddRuleRequest {

    /** Product to re-add; mutually exclusive with {@code customNameHe}. */
    private UUID productId;
    /** Custom item name to re-add when no product is linked. */
    private String customNameHe;
    /** Category snapshot for custom items (null = category-less). */
    private UUID categoryId;
}
