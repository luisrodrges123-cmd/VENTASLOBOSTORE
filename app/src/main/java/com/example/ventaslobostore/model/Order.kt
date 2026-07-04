package com.example.ventaslobostore.model

import com.google.firebase.database.Exclude
import com.google.firebase.database.IgnoreExtraProperties

@IgnoreExtraProperties
data class Order(
    @get:Exclude var id: String? = null,
    val username: String = "",
    val phone: String = "",
    val name: String = "", // Cambiado para coincidir con web
    val price: Double = 0.0,
    val imageUrl: String = "",
    val status: String = "PENDIENTE",
    val timestamp: Long = System.currentTimeMillis(),
    val quantity: Int = 1,
    val totalPrice: Double = 0.0,
    val productId: String? = null,
    val description: String = "",
    val category: String = ""
)
