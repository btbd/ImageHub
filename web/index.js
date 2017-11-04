(function(document) {
	$(document).ready(ready);
	$(window).on("resize", ready);
	
	var e_query = document.getElementById("query");
	var e_namespace = document.getElementById("namespace");
	var e_automated = document.getElementById("automated");
	var e_official = document.getElementById("official");
	var e_order = document.getElementById("order");
	var e_search = document.getElementById("search");
	var e_results_count = document.getElementById("results_count");
	var e_progress = document.getElementById("progress");
	var e_results = document.getElementById("results");
	var e_description = document.getElementById("description");

	var SORT_NONE = -1,
		SORT_NAMESPACE_UP = 0,
		SORT_NAMESPACE_DOWN = 1,
		SORT_REPOSITORY_UP = 2,
		SORT_REPOSITORY_DOWN = 3,
		SORT_TYPE_UP = 4,
		SORT_TYPE_DOWN = 5,
		SORT_AUTOMATED_UP = 6,
		SORT_AUTOMATED_DOWN = 7,
		SORT_STARS_UP = 8,
		SORT_STARS_DOWN = 9,
		SORT_PULLS_UP = 10,
		SORT_PULLS_DOWN = 11;

	var sort = SORT_REPOSITORY_UP;

	var search_id = 0;
	var search_total = 0;
	var search_done = 0;

	function search() {
		$("body").addClass("wait");
		
		e_results.innerHTML = "";;
		$(e_results).css({ display: "none", width: "100%" });
		e_results_count.innerHTML = "Results: 0";
		e_progress.innerHTML = "Progress: 0%";
		$(e_progress).attr("style", "");
		search_total = search_done = 0;

		var query = encodeURIComponent(e_query.value);
		var namespace = encodeURIComponent(e_namespace.value);
		
		window.history.replaceState(null, null, window.location.pathname);
		if (query || namespace) {
			var q = "?" + (query ? "q=" + query + "&" : "") + (namespace ? "n=" + namespace + "&" : "") + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "");
			if (q.charAt(q.length - 1) === '&') q = q.slice(0, -1);
			window.history.replaceState(null, null, q);
		}

		search_id = Date.now();
		sort = -1;
		hideArrows();
			
		if (isBlank(namespace)) {
			var url = "./search?q=" + query + "&" + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "") + "p=";
			$.getJSON(url + "0", function(e) {
				search_total = e.count ? e.count : 0;
				e_results_count.innerHTML = "Results: " + search_total;
				querySearch(search_id, e.results, url, 0);
			}).fail(finishSearch);
		} else {
			var url = "./search?s=1000&n=" + namespace + (query ? "&q=" + query : "") + "&" + (e_official.checked ? "o=1&" : "") + (e_automated.checked ? "a=1&" : "") + "p=";
			$.getJSON(url + "0", function(e) {
				search_total = e.count ? e.count : 0;
				e_results_count.innerHTML = "Results: " + search_total;
				querySearch(search_id, e.results, url, 0);
			}).fail(finishSearch);
		}
	}

	function querySearch(id, results, url, page) {
		if (!results || results.length === 0) {
			finishSearch();
			return;
		}
		
		$(e_progress).attr("style", "");

		for (var i = 0; i < results.length && id === search_id && search_done < search_total; ++i, ++search_done) {
			var row = e_results.insertRow(-1);
			row.insertCell(0).innerHTML = "<a href=\"" + window.location.href.replace(window.location.search, "") + "?n=" + results[i].namespace + "\">" + results[i].namespace + "</a>";
			row.insertCell(1).innerHTML = "<a href=\"https://hub.docker.com/" + (results[i].is_official ? "_/" : "r/" + (results[i].namespace ? results[i].namespace + "/" : "")) + results[i].name + "\">" + results[i].name + "</a>";
			addCellHover(row.cells[1], false)

			row.insertCell(2).innerHTML = results[i].is_official ? "official" : !results[i].is_private ? "public" : "private";
			row.insertCell(3).innerHTML = results[i].is_automated ? "yes" : "no";
			row.insertCell(4).innerHTML = results[i].star_count.toString();
			row.insertCell(5).innerHTML = results[i].pull_count.toString();
			row.insertCell(6).innerHTML = results[i].description;
			$(row.cells[6]).css({ "text-overflow": "ellipsis" });
			addCellHover(row.cells[6], true);
		}

		if (search_done !== 0 && search_total !== 0) e_progress.innerHTML = "Progress: " + Math.round((search_done / search_total) * 100) + "%";

		if (id === search_id && search_done < search_total) {
			$.getJSON(url + (++page), function(e) {
				querySearch(id, e.results, url, page);
			}).fail(finishSearch);
		} else if (search_done === search_total) {
			finishSearch();
		}
	}

	function sortResults() {
		if (sort === SORT_NONE) return;

		var rows = [];
		for (var i = e_results.rows.length - 1; i > -1; --i) {
			rows.push(e_results.rows[i]);
		}

		switch (sort) {
			case SORT_NAMESPACE_UP:
				rows.sort(function(a, b) {
					var r = a.cells[0].innerText.localeCompare(b.cells[0].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_NAMESPACE_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[0].innerText.localeCompare(b.cells[0].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_REPOSITORY_UP:
				rows.sort(function(a, b) {
					var r = a.cells[1].innerText.localeCompare(b.cells[1].innerText);
					if (r !== 0) return r;
					
					return a.cells[0].innerText.localeCompare(b.cells[0].innerText);
				});
				break;
			case SORT_REPOSITORY_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[1].innerText.localeCompare(b.cells[1].innerText);
					if (r !== 0) return r;
					
					return a.cells[0].innerText.localeCompare(b.cells[0].innerText);
				});
				break;
			case SORT_TYPE_UP:
				rows.sort(function(a, b) {
					var r = a.cells[2].innerText.localeCompare(b.cells[2].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_TYPE_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[2].innerText.localeCompare(b.cells[2].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_AUTOMATED_UP:
				rows.sort(function(a, b) {
					var r = a.cells[3].innerText.localeCompare(b.cells[3].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_AUTOMATED_DOWN:
				rows.sort(function(a, b) {
					var r = -a.cells[3].innerText.localeCompare(b.cells[3].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_STARS_UP:
				rows.sort(function(a, b) {
					var r = -(parseInt(b.cells[4].innerText) - parseInt(a.cells[4].innerText));
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_STARS_DOWN:
				rows.sort(function(a, b) {
					var r = parseInt(b.cells[4].innerText) - parseInt(a.cells[4].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PULLS_UP:
				rows.sort(function(a, b) {
					var r = -(parseInt(b.cells[5].innerText) - parseInt(a.cells[5].innerText));
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
			case SORT_PULLS_DOWN:
				rows.sort(function(a, b) {
					var r = parseInt(b.cells[5].innerText) - parseInt(a.cells[5].innerText);
					if (r !== 0) return r;
					
					return a.cells[1].innerText.localeCompare(b.cells[1].innerText);
				});
				break;
		}

		
		for (var i = 0; i < rows.length; ++i) {
			e_results.deleteRow(0);
			e_results.insertRow(-1).innerHTML = rows[i].innerHTML;
		}
		
		var cells = e_results.getElementsByTagName("td");
		for (var i = 1; i < cells.length; i += e_results.rows[0].cells.length) {
			addCellHover(cells[i], false);
			addCellHover(cells[i + 5], true);
		}
	}
	
	function finishSearch() {
		e_progress.innerHTML = "Progress: 100%";
		$(e_progress).fadeOut("slow");
		$(e_results).attr("style", "");
		$(e_results).css("width", "100%");
		$("body").removeClass("wait");
	}

	function addCellHover(cell, click) {
		$(cell).mouseover(function(e) {
			if (this.offsetWidth < this.scrollWidth) {
				e_description.innerText = this.innerText;
				$(e_description).attr("style", "");
				$(e_description).css({
					"box-shadow": "0px 0px 10px #000000",
					padding: "5px 5px 5px 5px",
					top: this.getBoundingClientRect().top - this.offsetHeight - 10,
					right: $(window).width() - this.getBoundingClientRect().right
				});
			}
		});
			
		if (click) {
			$(cell).mousedown(function() {
				if (this.offsetWidth < this.scrollWidth) {
					var cell = this;
					$(cell).unbind("mouseleave");
					
					e_description.onmouseleave = function() {
						$(cell).mouseleave(function(e) {
							$(e_description).attr("style", "");
							$(e_description).css("display", "none");
						});
		
						$(e_description).attr("style", "");
						$(e_description).css("display", "none");
						$(e_description).unbind("mouseleave");
					};
					
					$(e_description).css({
						"box-shadow": "0px 0px 10px #000000",
						padding: "5px 5px 5px 5px",
						top: this.getBoundingClientRect().top - this.offsetHeight + 10,
						right: $(window).width() - this.getBoundingClientRect().right
					});
				}
			});
		}
			
		$(cell).mouseleave(function(e) {
			$(e_description).attr("style", "");
			$(e_description).css("display", "none");
		});
	}
	
	function isBlank(s) {
		return s.length === 0 || !s.trim();
	}
	
	function inputSearch(e) {
		if (e.keyCode === 13) {
			search();
		}
	}

	$(e_query).keypress(inputSearch);
	$(e_namespace).keypress(inputSearch);

	$(e_search).click(search);
	
	function ready() {
		$("#table_holder").css({ "margin-top": $("#options").outerHeight() + 10 });
		$("#results_holder").css({ "overflow-y": "scroll", height: $(window).height() - ($("#headers").offset().top + $("#headers").outerHeight() + 30) });
		$("#table_holder_margin").css({ "padding-right": getScrollBarWidth() });
	}

	$("#namespace_up").click(function() { sort = SORT_NAMESPACE_UP; sortResults(); });
	$("#namespace_down").click(function() { sort = SORT_NAMESPACE_DOWN; sortResults(); });
	$("#repository_up").click(function() { sort = SORT_REPOSITORY_UP; sortResults(); });
	$("#repository_down").click(function() { sort = SORT_REPOSITORY_DOWN; sortResults(); });
	$("#type_up").click(function() { sort = SORT_TYPE_UP; sortResults(); });
	$("#type_down").click(function() { sort = SORT_TYPE_DOWN; sortResults(); });
	$("#automated_up").click(function() { sort = SORT_AUTOMATED_UP; sortResults(); });
	$("#automated_down").click(function() { sort = SORT_AUTOMATED_DOWN; sortResults(); });
	$("#stars_up").click(function() { sort = SORT_STARS_UP; sortResults(); });
	$("#stars_down").click(function() { sort = SORT_STARS_DOWN; sortResults(); });
	$("#pulls_up").click(function() { sort = SORT_PULLS_UP; sortResults(); });
	$("#pulls_down").click(function() { sort = SORT_PULLS_DOWN; sortResults(); });
	
	function getScrollBarWidth () {
		var o = $("<div>").css({ visibility: "hidden", width: 100, overflow: "scroll" }).appendTo("body");
        var s = $("<div>").css({ width: "100%" }).appendTo(o).outerWidth();
		o.remove();
		return 100 - s;
	};
	
	function hideArrows() {
		$(".arrow-up, .arrow-down").each(function(i, e) {
			$(e).css("visibility", "hidden");
		});
	}
	
	$("#label_namespace").mousedown(function() {
		hideArrows();
		$("#namespace_down, #namespace_up").attr("style", "");
		
		if (sort == SORT_NAMESPACE_UP) {
			$("#namespace_down").css("visibility", "visible");
			$("#namespace_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_NAMESPACE_DOWN;
		} else {
			$("#namespace_down").css("visibility", "hidden");
			$("#namespace_up").css("visibility", "visible");
			sort = SORT_NAMESPACE_UP;
		}
		
		sortResults();
	});
	
	$("#label_repository").mousedown(function() {
		hideArrows();
		$("#repository_down, #repository_up").attr("style", "");
		
		if (sort == SORT_REPOSITORY_UP) {
			$("#repository_down").css("visibility", "visible");
			$("#repository_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_REPOSITORY_DOWN;
		} else {
			$("#repository_down").css("visibility", "hidden");
			$("#repository_up").css("visibility", "visible");
			sort = SORT_REPOSITORY_UP;
		}
		
		sortResults();
	});
	
	$("#label_type").mousedown(function() {
		hideArrows();
		$("#type_down, #type_up").attr("style", "");
		
		if (sort == SORT_TYPE_UP) {
			$("#type_down").css("visibility", "visible");
			$("#type_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_TYPE_DOWN;
		} else {
			$("#type_down").css("visibility", "hidden");
			$("#type_up").css("visibility", "visible");
			sort = SORT_TYPE_UP;
		}
		
		sortResults();
	});
	
	$("#label_automated").mousedown(function() {
		hideArrows();
		$("#automated_down, #automated_up").attr("style", "");
		
		if (sort == SORT_AUTOMATED_UP) {
			$("#automated_down").css("visibility", "visible");
			$("#automated_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_AUTOMATED_DOWN;
		} else {
			$("#automated_down").css("visibility", "hidden");
			$("#automated_up").css("visibility", "visible");
			sort = SORT_AUTOMATED_UP;
		}
		
		sortResults();
	});
	
	$("#label_stars").mousedown(function() {
		hideArrows();
		$("#stars_down, #stars_up").attr("style", "");
		
		if (sort == SORT_STARS_UP) {
			$("#stars_down").css("visibility", "visible");
			$("#stars_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_STARS_DOWN;
		} else {
			$("#stars_down").css("visibility", "hidden");
			$("#stars_up").css("visibility", "visible");
			sort = SORT_STARS_UP;
		}
		
		sortResults();
	});
	
	$("#label_pulls").mousedown(function() {
		hideArrows();
		$("#pulls_down, #pulls_up").attr("style", "");
		
		if (sort == SORT_PULLS_UP) {
			$("#pulls_down").css("visibility", "visible");
			$("#pulls_up").css({ visibility: "hidden", position: "absolute" });
			sort = SORT_PULLS_DOWN;
		} else {
			$("#pulls_down").css("visibility", "hidden");
			$("#pulls_up").css("visibility", "visible");
			sort = SORT_PULLS_UP;
		}
		
		sortResults();
	});
	
	$(e_official).click(function() {
		if (e_official.checked) {
			e_namespace.value = "library";
			e_namespace.disabled = true;
		} else {
			e_namespace.value = "";
			e_namespace.disabled = false;
		}
	});
	
	if (!isBlank(window.location.search)) {
		var s = decodeURIComponent(window.location.search.slice(1));
		if (!isBlank(s)) {
			var i = s.indexOf("n=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_namespace.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("q=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				e_query.value = s.substring(i + 2, e === -1 ? s.length : e);
			}
			
			i = s.indexOf("a=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_automated.checked = true;
				}
			}
			
			i = s.indexOf("o=");
			if (i !== -1) {
				var e = s.indexOf("&", i);
				if (s.substring(i + 2, e === -1 ? s.length : e) === "1") {
					e_official.checked = true;
				}
			}
			
			search();
		}
	}
})(document);
