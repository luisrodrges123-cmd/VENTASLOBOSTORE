package com.example.ventaslobostore

import android.content.Intent
import android.os.Bundle
import androidx.fragment.app.Fragment
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import android.util.Log
import com.example.ventaslobostore.adapter.ArticleAdapter
import com.example.ventaslobostore.databinding.FragmentFirstBinding
import com.example.ventaslobostore.repository.ArticleRepository
import kotlinx.coroutines.launch

class FirstFragment : Fragment() {

    private var _binding: FragmentFirstBinding? = null
    private val binding get() = _binding!!
    private val articleRepository = ArticleRepository()
    private lateinit var articleAdapter: ArticleAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        Log.d("FirstFragment", "onCreateView called")
        _binding = FragmentFirstBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        Log.d("FirstFragment", "onViewCreated called")

        setupRecyclerView()
        loadArticles()
    }

    private fun setupRecyclerView() {
        Log.d("FirstFragment", "Setting up RecyclerView")
        articleAdapter = ArticleAdapter(emptyList()) { article ->
            // Manejar clic en artículo, por ejemplo, ver detalles
            val bundle = Bundle().apply {
                putString("articleId", article.id)
            }
            findNavController().navigate(R.id.action_FirstFragment_to_SecondFragment, bundle)
        }
        binding.recyclerViewArticles.apply {
            layoutManager = GridLayoutManager(requireContext(), 2)
            adapter = articleAdapter
        }
    }

    private fun loadArticles() {
        Log.d("FirstFragment", "Loading articles...")
        viewLifecycleOwner.lifecycleScope.launch {
            val articles = articleRepository.getArticles()
            Log.d("FirstFragment", "Articles loaded: ${articles.size}")
            if (articles.isEmpty()) {
                android.widget.Toast.makeText(requireContext(), "No hay productos disponibles", android.widget.Toast.LENGTH_SHORT).show()
            }
            articleAdapter.updateArticles(articles)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
