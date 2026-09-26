package com.listyyy.backend;

import com.listyyy.backend.list.ListItemAutoAddRule;
import com.listyyy.backend.list.ListItemAutoAddService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AutoAddIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private ListItemAutoAddService autoAddService;

    @Test
    void upsert_and_get_rule_for_product_item() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 2);

        mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 5,
                                "everyN", 2,
                                "everyUnit", "WEEKS",
                                "enabled", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(5))
                .andExpect(jsonPath("$.everyN").value(2))
                .andExpect(jsonPath("$.everyUnit").value("WEEKS"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.nextRunAt").exists());

        mvc.perform(get("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(5))
                .andExpect(jsonPath("$.everyN").value(2));

        mvc.perform(get("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void upsert_rejects_invalid_frequency() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);

        mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 1,
                                "everyN", 0,
                                "everyUnit", "DAYS"))))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 1,
                                "everyN", 1,
                                "everyUnit", "CENTURIES"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void delete_rule() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);
        upsertRule(listId, itemId, 3, 1, "DAYS", true);

        mvc.perform(delete("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNotFound());
    }

    @Test
    void scheduler_readds_missing_product_item_and_skips_present_item() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 2);
        upsertRule(listId, itemId, 5, 1, "DAYS", true);

        // Item present but rule due -> skipped, only the fire time advances
        forceDue();
        autoAddService.processDueRules();
        assertEquals(1, countItems(listId));

        // Item removed -> next run re-adds it with the rule quantity
        mvc.perform(delete("/api/lists/" + listId + "/items/" + itemId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());
        forceDue();
        autoAddService.processDueRules();

        mvc.perform(get("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].displayName").value("אורז"))
                .andExpect(jsonPath("$[0].quantity").value(5))
                .andExpect(jsonPath("$[0].note").value("נוסף אוטומטית"));

        List<ListItemAutoAddRule> rules = autoAddRuleRepository.findAll();
        assertEquals(1, rules.size());
        assertTrue(rules.get(0).getNextRunAt().isAfter(Instant.now()));
    }

    @Test
    void scheduler_readds_missing_custom_item() throws Exception {
        String listId = createList("Auto list");
        String itemId = addCustomItem(listId, "פריט מיוחד");
        upsertRule(listId, itemId, 2, 1, "WEEKS", true);

        mvc.perform(delete("/api/lists/" + listId + "/items/" + itemId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());
        forceDue();
        autoAddService.processDueRules();

        mvc.perform(get("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].displayName").value("פריט מיוחד"))
                .andExpect(jsonPath("$[0].quantity").value(2))
                .andExpect(jsonPath("$[0].note").value("נוסף אוטומטית"));
    }

    @Test
    void scheduler_appends_marker_to_existing_note() throws Exception {
        String listId = createList("Auto list");
        String itemId = addCustomItem(listId, "פריט עם הערה", "לקנות טרי");
        upsertRule(listId, itemId, 1, 1, "DAYS", true);

        mvc.perform(delete("/api/lists/" + listId + "/items/" + itemId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());
        forceDue();
        autoAddService.processDueRules();

        mvc.perform(get("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].note").value("לקנות טרי · נוסף אוטומטית"));
    }

    @Test
    void scheduler_skips_disabled_rule() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);
        upsertRule(listId, itemId, 4, 1, "DAYS", false);

        mvc.perform(delete("/api/lists/" + listId + "/items/" + itemId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());
        forceDue();
        autoAddService.processDueRules();

        mvc.perform(get("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void deleting_product_removes_its_rules() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);
        upsertRule(listId, itemId, 1, 1, "DAYS", true);
        assertEquals(1, autoAddRuleRepository.findAll().size());

        mvc.perform(delete("/api/products/" + productId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());

        assertEquals(0, autoAddRuleRepository.findAll().size());
    }

    @Test
    void deleting_list_removes_its_rules() throws Exception {        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);
        upsertRule(listId, itemId, 1, 1, "MONTHS", true);
        assertEquals(1, autoAddRuleRepository.findAll().size());

        mvc.perform(delete("/api/lists/" + listId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());

        assertEquals(0, autoAddRuleRepository.findAll().size());
    }

    @Test
    void create_rule_from_list_endpoint_and_syncs_with_item_endpoint() throws Exception {
        String listId = createList("Auto list");

        // Define the rule from list settings before the item is even on the list
        ResultActions create = mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", productId.toString(),
                                "quantity", 2,
                                "everyN", 1,
                                "everyUnit", "MONTHS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.everyUnit").value("MONTHS"))
                .andExpect(jsonPath("$.nextRunAt").exists());

        mvc.perform(get("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        // Once the item is added, the item endpoint serves the same rule
        String itemId = addProductItem(listId, 1);
        mvc.perform(get("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(2));

        // Saving through the item endpoint updates the same rule (no duplicate)
        mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 7,
                                "everyN", 1,
                                "everyUnit", "MONTHS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(7));

        mvc.perform(get("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].quantity").value(7));
    }

    @Test
    void create_rule_rejects_duplicates_and_bad_input() throws Exception {
        String listId = createList("Auto list");

        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", productId.toString(),
                                "quantity", 1,
                                "everyN", 1,
                                "everyUnit", "DAYS"))))
                .andExpect(status().isOk());

        // Same product twice
        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", productId.toString(),
                                "quantity", 1,
                                "everyN", 1,
                                "everyUnit", "DAYS"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("כבר מוגדרת")));

        // No target at all
        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 1,
                                "everyN", 1,
                                "everyUnit", "DAYS"))))
                .andExpect(status().isBadRequest());

        // Both targets at once
        var both = objectMapper.createObjectNode();
        both.put("productId", productId.toString());
        both.put("customNameHe", "משהו");
        both.put("everyN", 1);
        both.put("everyUnit", "DAYS");
        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(both.toString()))
                .andExpect(status().isBadRequest());

        // Custom-name rule works and also rejects duplicates
        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "customNameHe", "פריט מיוחד",
                                "categoryId", categoryId.toString(),
                                "quantity", 1,
                                "everyN", 2,
                                "everyUnit", "WEEKS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customNameHe").value("פריט מיוחד"));

        mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "customNameHe", "פריט מיוחד",
                                "everyN", 2,
                                "everyUnit", "WEEKS"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void update_and_delete_rule_by_id() throws Exception {
        String listId = createList("Auto list");
        String ruleId = createProductRule(listId, 1, 1, "DAYS");

        // Partial schedule update
        mvc.perform(put("/api/lists/" + listId + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "everyN", 3,
                                "everyUnit", "YEARS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.everyN").value(3))
                .andExpect(jsonPath("$.everyUnit").value("YEARS"))
                .andExpect(jsonPath("$.quantity").value(1));

        // Disable keeps the schedule for later
        mvc.perform(put("/api/lists/" + listId + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("enabled", false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.everyN").value(3));

        // Bad schedule rejected
        mvc.perform(put("/api/lists/" + listId + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("everyN", 0))))
                .andExpect(status().isBadRequest());

        mvc.perform(delete("/api/lists/" + listId + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void rule_id_endpoints_reject_other_lists() throws Exception {
        String listA = createList("List A");
        String listB = createList("List B");
        String ruleId = createProductRule(listA, 1, 1, "DAYS");

        mvc.perform(put("/api/lists/" + listB + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("enabled", false))))
                .andExpect(status().isNotFound());

        mvc.perform(delete("/api/lists/" + listB + "/auto-add/" + ruleId)
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isNotFound());
    }

    @Test
    void next_run_is_anchored_to_8am_on_the_target_day() throws Exception {
        String listId = createList("Auto list");
        String itemId = addProductItem(listId, 1);

        ResultActions r = mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", 1,
                                "everyN", 1,
                                "everyUnit", "DAYS"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextRunAt").exists());
        String nextRunAt = objectMapper.readTree(r.andReturn().getResponse().getContentAsString()).get("nextRunAt").asText();

        java.time.ZonedDateTime zoned = java.time.Instant.parse(nextRunAt).atZone(java.time.ZoneId.of("Asia/Jerusalem"));
        assertEquals(8, zoned.getHour());
        assertEquals(0, zoned.getMinute());
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Jerusalem"));
        assertTrue(!zoned.toLocalDate().isBefore(today.plusDays(1)) && !zoned.toLocalDate().isAfter(today.plusDays(2)));
    }

    private String createProductRule(String listId, int quantity, int everyN, String everyUnit) throws Exception {
        ResultActions r = mvc.perform(post("/api/lists/" + listId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", productId.toString(),
                                "quantity", quantity,
                                "everyN", everyN,
                                "everyUnit", everyUnit))))
                .andExpect(status().isOk());
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private void upsertRule(String listId, String itemId, int quantity, int everyN, String everyUnit, boolean enabled) throws Exception {
        mvc.perform(put("/api/lists/" + listId + "/items/" + itemId + "/auto-add")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quantity", quantity,
                                "everyN", everyN,
                                "everyUnit", everyUnit,
                                "enabled", enabled))))
                .andExpect(status().isOk());
    }

    private void forceDue() {
        List<ListItemAutoAddRule> rules = autoAddRuleRepository.findAll();
        assertEquals(1, rules.size());
        ListItemAutoAddRule rule = rules.get(0);
        rule.setNextRunAt(Instant.now().minusSeconds(3600));
        autoAddRuleRepository.saveAndFlush(rule);
    }

    private int countItems(String listId) throws Exception {
        String body = mvc.perform(get("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).size();
    }

    private String createList(String name) throws Exception {
        ResultActions r = mvc.perform(post("/api/lists")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", name,
                                "workspaceId", workspaceId.toString()))))
                .andExpect(status().isOk());
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String addProductItem(String listId, int quantity) throws Exception {
        ResultActions r = mvc.perform(post("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "productId", productId.toString(),
                                "quantity", quantity))))
                .andExpect(status().isOk());
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String addCustomItem(String listId, String name) throws Exception {
        return addCustomItem(listId, name, null);
    }

    private String addCustomItem(String listId, String name, String note) throws Exception {
        var node = objectMapper.createObjectNode();
        node.put("customNameHe", name);
        node.put("quantity", 1);
        if (note != null) node.put("note", note);
        ResultActions r = mvc.perform(post("/api/lists/" + listId + "/items")
                        .header("Authorization", getBearerToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(node.toString()))
                .andExpect(status().isOk());
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString()).get("id").asText();
    }
}
