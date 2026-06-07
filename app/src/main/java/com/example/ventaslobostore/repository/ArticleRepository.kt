package com.example.ventaslobostore.repository

import android.util.Log
import com.example.ventaslobostore.model.Article
import com.example.ventaslobostore.model.Order
import com.google.firebase.database.FirebaseDatabase
import kotlinx.coroutines.tasks.await

class ArticleRepository {
    private val database = FirebaseDatabase.getInstance()
    private val articlesRef = database.getReference("products")
    private val ordersRef = database.getReference("orders")

    // --- PRODUCTS ---
    suspend fun getArticles(): List<Article> {
        // ... (existing code, keeping it for now)
        return try {
            val snapshot = articlesRef.get().await()
            val list = mutableListOf<Article>()
            snapshot.children.forEach { child ->
                child.getValue(Article::class.java)?.let { article ->
                    article.id = child.key
                    list.add(article)
                }
            }
            list
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun getArticle(id: String): Article? {
        return try {
            val snapshot = articlesRef.child(id).get().await()
            snapshot.getValue(Article::class.java)?.apply {
                this.id = snapshot.key
            }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun addArticle(article: Article) {
        val key = articlesRef.push().key
        key?.let {
            articlesRef.child(it).setValue(article).await()
        }
    }

    suspend fun updateArticle(article: Article) {
        article.id?.let {
            articlesRef.child(it).setValue(article).await()
        }
    }

    suspend fun deleteArticle(articleId: String) {
        articlesRef.child(articleId).removeValue().await()
    }

    // --- ORDERS ---
    suspend fun getOrders(): List<Order> {
        return try {
            val snapshot = ordersRef.get().await()
            val list = mutableListOf<Order>()
            snapshot.children.forEach { child ->
                child.getValue(Order::class.java)?.let { order ->
                    order.id = child.key
                    list.add(order)
                }
            }
            list.reversed() // Most recent first
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun addOrder(order: Order) {
        val key = ordersRef.push().key
        key?.let {
            ordersRef.child(it).setValue(order).await()
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        ordersRef.child(orderId).child("status").setValue(newStatus).await()
    }

    suspend fun deleteOrder(orderId: String) {
        ordersRef.child(orderId).removeValue().await()
    }
}
