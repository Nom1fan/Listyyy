package com.listyyy.backend.list;

import com.listyyy.backend.auth.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.listyyy.backend.productbank.Category;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/lists")
@RequiredArgsConstructor
public class ListController {

    private final GroceryListService listService;
    private final ListItemService listItemService;
    private final ListItemAutoAddService autoAddService;

    @GetMapping
    public ResponseEntity<List<ListResponse>> list(
            @RequestParam(required = false) UUID workspaceId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        List<GroceryList> lists;
        if (workspaceId != null) {
            lists = listService.listsForWorkspace(workspaceId, user);
        } else {
            lists = listService.listsForUser(user);
        }
        List<UUID> listIds = lists.stream().map(GroceryList::getId).toList();
        Map<UUID, Long> itemCounts = listItemService.getItemCountsByListIds(listIds);
        List<ListResponse> body = lists.stream()
                .map(l -> toListResponse(l, itemCounts.getOrDefault(l.getId(), 0L)))
                .toList();
        return ResponseEntity.ok(body);
    }

    @PostMapping
    public ResponseEntity<ListResponse> create(
            @AuthenticationPrincipal User user,
            @RequestBody CreateListRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        if (req.getWorkspaceId() == null) throw new IllegalArgumentException("חובה לציין מרחב");
        GroceryList list = listService.create(user, req.getWorkspaceId(), req.getName(), req.getIconId(), req.getImageUrl(),
                req.getCategoryIds());
        long count = listItemService.getItemCountsByListIds(List.of(list.getId())).getOrDefault(list.getId(), 0L);
        return ResponseEntity.ok(toListResponse(list, count));
    }

    @GetMapping("/{listId}")
    public ResponseEntity<ListResponse> get(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        GroceryList list = listService.get(listId, user);
        long count = listItemService.getItemCountsByListIds(List.of(list.getId())).getOrDefault(list.getId(), 0L);
        return ResponseEntity.ok(toListResponse(list, count));
    }

    @PutMapping("/{listId}")
    public ResponseEntity<ListResponse> update(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user,
            @RequestBody UpdateListRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        GroceryList list = listService.update(listId, user, req.getName(), req.getIconId(), req.getImageUrl(), req.getVersion(),
                req.getCategoryIds());
        long count = listItemService.getItemCountsByListIds(List.of(list.getId())).getOrDefault(list.getId(), 0L);
        return ResponseEntity.ok(toListResponse(list, count));
    }

    @DeleteMapping("/{listId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        listService.delete(listId, user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{listId}/items")
    public ResponseEntity<List<ListItemResponse>> getItems(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        List<ListItem> items = listItemService.getItems(listId, user);
        List<ListItemResponse> body = items.stream().map(this::toItemResponse).toList();
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{listId}/items")
    public ResponseEntity<ListItemResponse> addItem(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user,
            @RequestBody AddListItemRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        ListItem item = listItemService.addItem(listId, user, req);
        return ResponseEntity.ok(toItemResponse(item));
    }

    @PatchMapping("/{listId}/items/{itemId}")
    public ResponseEntity<ListItemResponse> updateItem(
            @PathVariable UUID listId,
            @PathVariable UUID itemId,
            @AuthenticationPrincipal User user,
            @RequestBody UpdateListItemRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        ListItem item = listItemService.updateItem(listId, itemId, user, req);
        return ResponseEntity.ok(toItemResponse(item));
    }

    @DeleteMapping("/{listId}/items/{itemId}")
    public ResponseEntity<Void> removeItem(
            @PathVariable UUID listId,
            @PathVariable UUID itemId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        listItemService.removeItem(listId, itemId, user);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{listId}/items/reorder")
    public ResponseEntity<Void> reorderItems(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user,
            @RequestBody ReorderListItemsRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        listItemService.reorderItems(listId, user, req.getItemIds());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/reorder")
    public ResponseEntity<Void> reorder(
            @AuthenticationPrincipal User user,
            @RequestBody ReorderListsRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        listService.reorder(user, req.getListIds());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{listId}/auto-add")
    public ResponseEntity<List<AutoAddRuleResponse>> listAutoAddRules(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        List<AutoAddRuleResponse> body = autoAddService.listForList(listId, user).stream()
                .map(this::toAutoAddResponse)
                .toList();
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{listId}/auto-add")
    public ResponseEntity<AutoAddRuleResponse> createAutoAddRule(
            @PathVariable UUID listId,
            @AuthenticationPrincipal User user,
            @RequestBody AutoAddRuleCreateRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        ListItemAutoAddRule rule = autoAddService.createForList(listId, user, req);
        return ResponseEntity.ok(toAutoAddResponse(rule));
    }

    @PutMapping("/{listId}/auto-add/{ruleId}")
    public ResponseEntity<AutoAddRuleResponse> updateAutoAddRule(
            @PathVariable UUID listId,
            @PathVariable UUID ruleId,
            @AuthenticationPrincipal User user,
            @RequestBody AutoAddRuleRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        ListItemAutoAddRule rule = autoAddService.updateRule(listId, ruleId, user, req);
        return ResponseEntity.ok(toAutoAddResponse(rule));
    }

    @DeleteMapping("/{listId}/auto-add/{ruleId}")
    public ResponseEntity<Void> deleteAutoAddRuleById(
            @PathVariable UUID listId,
            @PathVariable UUID ruleId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        autoAddService.deleteRule(listId, ruleId, user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{listId}/items/{itemId}/auto-add")
    public ResponseEntity<AutoAddRuleResponse> getAutoAddRule(
            @PathVariable UUID listId,
            @PathVariable UUID itemId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.of(autoAddService.getForItem(listId, itemId, user).map(this::toAutoAddResponse));
    }

    @PutMapping("/{listId}/items/{itemId}/auto-add")
    public ResponseEntity<AutoAddRuleResponse> upsertAutoAddRule(
            @PathVariable UUID listId,
            @PathVariable UUID itemId,
            @AuthenticationPrincipal User user,
            @RequestBody AutoAddRuleRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        ListItemAutoAddRule rule = autoAddService.upsertForItem(listId, itemId, user, req);
        return ResponseEntity.ok(toAutoAddResponse(rule));
    }

    @DeleteMapping("/{listId}/items/{itemId}/auto-add")
    public ResponseEntity<Void> deleteAutoAddRule(
            @PathVariable UUID listId,
            @PathVariable UUID itemId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        autoAddService.deleteForItem(listId, itemId, user);
        return ResponseEntity.noContent().build();
    }

    private ListResponse toListResponse(GroceryList list, long itemCount) {
        List<UUID> categoryIds = list.getCategories().stream()
                .map(Category::getId)
                .toList();
        return ListResponse.builder()
                .id(list.getId())
                .name(list.getName())
                .workspaceId(list.getWorkspace().getId())
                .iconId(list.getIconId())
                .imageUrl(list.getImageUrl())
                .sortOrder(list.getSortOrder())
                .categoryIds(categoryIds)
                .createdAt(list.getCreatedAt())
                .updatedAt(list.getUpdatedAt())
                .version(list.getVersion())
                .itemCount((int) itemCount)
                .build();
    }

    private AutoAddRuleResponse toAutoAddResponse(ListItemAutoAddRule rule) {
        return AutoAddRuleResponse.builder()
                .id(rule.getId())
                .listId(rule.getList().getId())
                .productId(rule.getProduct() != null ? rule.getProduct().getId() : null)
                .customNameHe(rule.getCustomNameHe())
                .quantity(rule.getQuantity())
                .unit(rule.getUnit())
                .everyN(rule.getEveryN())
                .everyUnit(rule.getEveryUnit())
                .enabled(rule.isEnabled())
                .nextRunAt(rule.getNextRunAt())
                .version(rule.getVersion())
                .build();
    }

    private ListItemResponse toItemResponse(ListItem item) {
        UUID categoryId = null;
        String categoryNameHe = null;
        String categoryIconId = null;
        String iconId = item.getIconId();
        String productImageUrl = null;
        if (item.getProduct() != null) {
            if (item.getProduct().getCategory() != null) {
                categoryId = item.getProduct().getCategory().getId();
                categoryNameHe = item.getProduct().getCategory().getNameHe();
                categoryIconId = item.getProduct().getCategory().getIconId();
            }
            if (iconId == null) iconId = item.getProduct().getIconId();
            productImageUrl = item.getProduct().getImageUrl();
        }
        // Direct category on custom items overrides product-based category
        if (item.getCategory() != null) {
            categoryId = item.getCategory().getId();
            categoryNameHe = item.getCategory().getNameHe();
            categoryIconId = item.getCategory().getIconId();
        }
        return ListItemResponse.builder()
                .id(item.getId())
                .listId(item.getList().getId())
                .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                .customNameHe(item.getCustomNameHe())
                .displayName(item.getDisplayName())
                .categoryId(categoryId)
                .categoryNameHe(categoryNameHe)
                .categoryIconId(categoryIconId)
                .iconId(iconId)
                .quantity(item.getQuantity())
                .unit(item.getUnit())
                .showQuantityUnit(item.isShowQuantityUnit())
                .note(item.getNote())
                .crossedOff(item.isCrossedOff())
                .itemImageUrl(item.getItemImageUrl())
                .productImageUrl(productImageUrl)
                .sortOrder(item.getSortOrder())
                .createdAt(item.getCreatedAt())
                .updatedAt(item.getUpdatedAt())
                .version(item.getVersion())
                .build();
    }
}
