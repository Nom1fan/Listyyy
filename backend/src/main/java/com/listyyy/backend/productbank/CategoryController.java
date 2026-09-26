package com.listyyy.backend.productbank;

import com.listyyy.backend.auth.User;
import com.listyyy.backend.exception.AccessDeniedException;
import com.listyyy.backend.exception.VersionCheck;
import com.listyyy.backend.list.GroceryListRepository;
import com.listyyy.backend.list.ListItemAutoAddRuleRepository;
import com.listyyy.backend.list.ListItemRepository;
import com.listyyy.backend.websocket.WorkspaceEvent;
import com.listyyy.backend.websocket.WorkspaceEventPublisher;
import com.listyyy.backend.workspace.Workspace;
import com.listyyy.backend.workspace.WorkspaceAccessService;
import com.listyyy.backend.workspace.WorkspaceRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryRepository categoryRepository;
    private final CategoryAccessService categoryAccessService;
    private final ProductRepository productRepository;
    private final ListItemRepository listItemRepository;
    private final ListItemAutoAddRuleRepository autoAddRuleRepository;
    private final GroceryListRepository groceryListRepository;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceAccessService workspaceAccessService;
    private final WorkspaceEventPublisher workspaceEventPublisher;

    @GetMapping
    public ResponseEntity<List<CategoryDto>> list(
            @RequestParam(required = false) UUID workspaceId,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        List<Category> categories;
        if (workspaceId != null) {
            workspaceAccessService.getWorkspaceOrThrow(workspaceId, user);
            categories = categoryRepository.findByWorkspaceId(workspaceId);
        } else {
            categories = categoryRepository.findVisibleToUser(user.getId());
        }
        Map<UUID, Long> addCountByCategory = getCategoryAddCounts();
        List<CategoryDto> body = categories.stream()
                .map(c -> toDto(c, addCountByCategory.getOrDefault(c.getId(), 0L)))
                .sorted((a, b) -> Integer.compare(a.getSortOrder(), b.getSortOrder()))
                .toList();
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    public ResponseEntity<CategoryDto> get(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        if (user == null) return ResponseEntity.status(401).build();
        if (categoryRepository.findById(id).isEmpty()) return ResponseEntity.notFound().build();
        Category c = categoryAccessService.getCategoryOrThrow(id, user);
        Map<UUID, Long> addCountByCategory = getCategoryAddCounts();
        return ResponseEntity.ok(toDto(c, addCountByCategory.getOrDefault(c.getId(), 0L)));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<CategoryDto> create(
            @Valid @RequestBody CreateCategoryRequest req,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        UUID wsId = req.getWorkspaceId();
        if (wsId == null) throw new IllegalArgumentException("חובה לציין מרחב");
        Workspace workspace = workspaceAccessService.getWorkspaceOrThrow(wsId, user);
        String trimmedName = req.getNameHe().trim();
        if (categoryRepository.existsByWorkspaceIdAndNameHe(wsId, trimmedName)) {
            throw new IllegalArgumentException("כבר קיימת קטגוריה בשם זה במרחב");
        }
        int sortOrder = req.getSortOrder() != null ? req.getSortOrder() : 0;
        Category c = Category.builder()
                .workspace(workspace)
                .nameHe(trimmedName)
                .iconId(req.getIconId())
                .imageUrl(req.getImageUrl())
                .sortOrder(sortOrder)
                .build();
        c = categoryRepository.save(c);
        workspaceEventPublisher.publish(wsId, WorkspaceEvent.EntityType.CATEGORY,
                WorkspaceEvent.Action.CREATED, c.getId(), c.getNameHe(), user);
        return ResponseEntity.ok(toDto(c, 0L));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CategoryDto> update(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user,
            @RequestBody UpdateCategoryRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        Category c = categoryAccessService.getCategoryOrThrow(id, user);
        if (!categoryAccessService.canEdit(user, id)) throw new AccessDeniedException("אין גישה");
        VersionCheck.check(req.getVersion(), c.getVersion());
        if (req.getNameHe() != null && !req.getNameHe().isBlank()) {
            String trimmedName = req.getNameHe().trim();
            if (!trimmedName.equals(c.getNameHe()) && categoryRepository.existsByWorkspaceIdAndNameHeAndIdNot(c.getWorkspace().getId(), trimmedName, c.getId())) {
                throw new IllegalArgumentException("כבר קיימת קטגוריה בשם זה במרחב");
            }
            c.setNameHe(trimmedName);
        }
        if (req.getIconId() != null) c.setIconId(req.getIconId().isBlank() ? null : req.getIconId());
        if (req.getImageUrl() != null) c.setImageUrl(req.getImageUrl().isBlank() ? null : req.getImageUrl());
        if (req.getSortOrder() != null) c.setSortOrder(req.getSortOrder());
        c = categoryRepository.save(c);
        workspaceEventPublisher.publish(c.getWorkspace().getId(), WorkspaceEvent.EntityType.CATEGORY,
                WorkspaceEvent.Action.UPDATED, c.getId(), c.getNameHe(), user);
        return ResponseEntity.ok(toDto(c, getCategoryAddCounts().getOrDefault(c.getId(), 0L)));
    }

    @PutMapping("/reorder")
    @Transactional
    public ResponseEntity<Void> reorder(
            @AuthenticationPrincipal User user,
            @RequestBody ReorderCategoriesRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        for (int i = 0; i < req.getCategoryIds().size(); i++) {
            Category c = categoryAccessService.getCategoryOrThrow(req.getCategoryIds().get(i), user);
            if (c.getSortOrder() != i) {
                c.setSortOrder(i);
                categoryRepository.save(c);
            }
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        Category c = categoryAccessService.getCategoryOrThrow(id, user);
        if (!categoryAccessService.isWorkspaceOwner(user, id)) {
            throw new AccessDeniedException("רק בעל המרחב יכול למחוק קטגוריה");
        }
        // Explicitly remove list items, products, and list-category attachments
        // before deleting the category, for H2 test compatibility (no ON DELETE CASCADE).
        listItemRepository.deleteByProductCategoryId(id);
        autoAddRuleRepository.deleteByProductCategoryId(id);
        autoAddRuleRepository.clearCategoryReferences(id);
        productRepository.findByCategoryIdOrderByNameHe(id)
                .forEach(p -> productRepository.delete(p));
        groceryListRepository.removeListCategoryEntriesByCategoryId(id);
        UUID wsId = c.getWorkspace().getId();
        String name = c.getNameHe();
        categoryRepository.delete(c);
        workspaceEventPublisher.publish(wsId, WorkspaceEvent.EntityType.CATEGORY,
                WorkspaceEvent.Action.DELETED, id, name, user);
        return ResponseEntity.noContent().build();
    }

    private Map<UUID, Long> getCategoryAddCounts() {
        return listItemRepository.countByCategoryId().stream()
                .collect(Collectors.toMap(
                        row -> toUuid(row[0]),
                        row -> ((Number) row[1]).longValue()
                ));
    }

    private static UUID toUuid(Object o) {
        if (o instanceof UUID) return (UUID) o;
        if (o instanceof byte[]) {
            java.nio.ByteBuffer bb = java.nio.ByteBuffer.wrap((byte[]) o);
            return new UUID(bb.getLong(), bb.getLong());
        }
        return UUID.fromString(o.toString());
    }

    private static CategoryDto toDto(Category c, long addCount) {
        return CategoryDto.builder()
                .id(c.getId())
                .workspaceId(c.getWorkspace() != null ? c.getWorkspace().getId() : null)
                .nameHe(c.getNameHe())
                .iconId(c.getIconId())
                .imageUrl(c.getImageUrl())
                .sortOrder(c.getSortOrder())
                .addCount(addCount)
                .version(c.getVersion())
                .build();
    }
}
